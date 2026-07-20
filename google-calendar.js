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
    ? `[캘린더] ${title} ${timeLabel}`
    : `[캘린더] ${title}`;
  return {
    id: event.id,
    text,
  };
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

module.exports = {
  fetchCalendarEventsForDate,
};
