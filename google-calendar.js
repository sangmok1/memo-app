function getDayBoundsKST(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return {
    timeMin: `${dateKey}T00:00:00+09:00`,
    timeMax: `${ny}-${nm}-${nd}T00:00:00+09:00`,
  };
}

function formatEventTimeKST(dateTime) {
  try {
    return new Date(dateTime).toLocaleTimeString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function formatCalendarEvent(event) {
  const title = String(event.summary || '').trim() || '(제목 없음)';
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const timeLabel = isAllDay
    ? '종일'
    : formatEventTimeKST(event.start?.dateTime);
  const text = timeLabel
    ? `${title} ${timeLabel} [캘린더]`
    : `${title} [캘린더]`;
  return {
    id: event.id,
    text,
  };
}

function isValidTimeHHMM(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function parseMemoCalendarExport(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || /\s\[캘린더\]\s*$/.test(trimmed)) return null;
  const match = trimmed.match(/^\[([^\]]+)\]\s*(.+?)\s*\((\d{1,2}:\d{2})\)\s*$/);
  if (!match) return null;
  const title = match[1].trim();
  const body = match[2].trim();
  const time = match[3];
  if (!title || !body || !isValidTimeHHMM(time)) return null;
  const [hour, minute] = time.split(':');
  const normalizedTime = `${String(Number(hour)).padStart(2, '0')}:${minute}`;
  return {
    title,
    body,
    time: normalizedTime,
    summary: `[${title}] ${body}`,
  };
}

function formatEndDateTimeKST(dateKey, timeHHMM, durationMinutes = 30) {
  const [hour, minute] = timeHHMM.split(':').map(Number);
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return `${dateKey}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00+09:00`;
}

async function fetchCalendarEventsForDate(accessToken, dateKey) {
  if (!accessToken) throw new Error('google_not_signed_in');
  const { timeMin, timeMax } = getDayBoundsKST(dateKey);
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new Error('calendar_permission_denied');
  }
  if (!res.ok) {
    throw new Error(data.error?.message || 'calendar_fetch_failed');
  }

  return (data.items || [])
    .filter((event) => event.status !== 'cancelled')
    .map(formatCalendarEvent);
}

async function upsertCalendarEvent(accessToken, dateKey, item, parsed) {
  const start = `${dateKey}T${parsed.time}:00+09:00`;
  const end = formatEndDateTimeKST(dateKey, parsed.time, 30);
  const body = {
    summary: parsed.summary,
    start: { dateTime: start, timeZone: 'Asia/Seoul' },
    end: { dateTime: end, timeZone: 'Asia/Seoul' },
  };

  if (item.exportedCalendarEventId) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(item.exportedCalendarEventId)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error('calendar_permission_denied');
    }
    if (res.status === 404) {
      delete item.exportedCalendarEventId;
      return upsertCalendarEvent(accessToken, dateKey, item, parsed);
    }
    if (!res.ok) {
      throw new Error(data.error?.message || 'calendar_export_failed');
    }
    return data.id || item.exportedCalendarEventId;
  }

  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new Error('calendar_permission_denied');
  }
  if (!res.ok) {
    throw new Error(data.error?.message || 'calendar_export_failed');
  }
  return data.id;
}

async function exportMemoItemsToCalendar(accessToken, dateKey, items) {
  if (!accessToken) throw new Error('google_not_signed_in');
  let exported = 0;
  let updated = 0;
  const updates = [];

  for (const item of items || []) {
    if (!item?.id || !item?.text?.trim() || item.done || item.calendarEventId) continue;
    const parsed = parseMemoCalendarExport(item.text);
    if (!parsed) continue;

    const hadEvent = Boolean(item.exportedCalendarEventId);
    const eventId = await upsertCalendarEvent(accessToken, dateKey, item, parsed);
    if (!eventId) continue;

    updates.push({
      id: item.id,
      exportedCalendarEventId: eventId,
      exportedCalendarDate: dateKey,
    });

    if (hadEvent) updated += 1;
    else exported += 1;
  }

  return { exported, updated, updates };
}

module.exports = {
  fetchCalendarEventsForDate,
  exportMemoItemsToCalendar,
  parseMemoCalendarExport,
};
