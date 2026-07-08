const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

let memoId = null;
let lastReportMeta = null;
let lastReportText = '';

function getKSTDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function formatKSTDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = WEEKDAY_LABELS[date.getDay()];
  return `${y}년 ${m}월 ${d}일 (${day})`;
}

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayKey() {
  return getDateKey(getKSTDate());
}

function getKSTDateFromKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getWeekRange(refDate, weekStartDay) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const diff = (start.getDay() - weekStartDay + 7) % 7;
  start.setDate(start.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function formatPeriodRangeLabel(startKey, endKey) {
  const start = getKSTDateFromKey(startKey);
  const end = getKSTDateFromKey(endKey);
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const wd = WEEKDAY_LABELS[d.getDay()];
    return `${y}년 ${m}월 ${day}일 (${wd})`;
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function getPeriodRange(periodType, refDate, weekStartDay = 2) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();

  switch (periodType) {
    case 'week': {
      const { start, end } = getWeekRange(refDate, weekStartDay);
      return { startKey: getDateKey(start), endKey: getDateKey(end), periodType };
    }
    case 'month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { startKey: getDateKey(start), endKey: getDateKey(end), periodType };
    }
    case 'quarter': {
      const q = Math.floor(m / 3);
      const start = new Date(y, q * 3, 1);
      const end = new Date(y, q * 3 + 3, 0);
      return { startKey: getDateKey(start), endKey: getDateKey(end), periodType, quarter: q + 1 };
    }
    case 'half': {
      const half = m < 6 ? 1 : 2;
      const start = new Date(y, half === 1 ? 0 : 6, 1);
      const end = new Date(y, half === 1 ? 6 : 12, 0);
      return { startKey: getDateKey(start), endKey: getDateKey(end), periodType, half };
    }
    case 'year': {
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31);
      return { startKey: getDateKey(start), endKey: getDateKey(end), periodType, year: y };
    }
    default:
      return getPeriodRange('week', refDate, weekStartDay);
  }
}

function getPeriodReportFileName(rangeMeta) {
  const { periodType, startKey, quarter, half, year } = rangeMeta;
  if (periodType === 'week') return `report-week-${startKey}.md`;
  if (periodType === 'month') return `report-month-${startKey.slice(0, 7)}.md`;
  if (periodType === 'quarter') return `report-quarter-${startKey.slice(0, 4)}-Q${quarter}.md`;
  if (periodType === 'half') return `report-half-${year}-H${half}.md`;
  return `report-year-${year || startKey.slice(0, 4)}.md`;
}

function getPeriodTypeLabel(periodType) {
  return ({ week: '주간', month: '월간', quarter: '분기', half: '반기', year: '년' })[periodType] || periodType;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSummaryLine(text, depth = 0) {
  const label = text.trim();
  if (depth === 1) return `      - ${label}`;
  return `- ${label}`;
}

function processPeriodReport(dayRecords) {
  const seen = new Set();
  let uniqueCount = 0;
  let totalRaw = 0;
  const days = [];

  dayRecords.forEach((day) => {
    const label = day.dateLabel || formatKSTDate(getKSTDateFromKey(day.date));
    const items = [];
    (day.items || []).forEach((item) => {
      const text = (item.text || '').trim();
      if (!text) return;
      totalRaw += 1;
      if (seen.has(text)) return;
      seen.add(text);
      uniqueCount += 1;
      items.push({ text, depth: item.depth || 0 });
    });
    days.push({ label, items });
  });

  return { days, uniqueCount, totalRaw, dayCount: dayRecords.length };
}

function buildPeriodReportText(dayRecords, rangeMeta, id) {
  const { days, uniqueCount, totalRaw, dayCount } = processPeriodReport(dayRecords);
  const lines = [
    `# 완료 기록 · ${getPeriodTypeLabel(rangeMeta.periodType)}`,
    '',
    `메모 ID: ${id}`,
    `기간: ${formatPeriodRangeLabel(rangeMeta.startKey, rangeMeta.endKey)}`,
    '',
  ];

  if (!dayCount) {
    lines.push('_이 기간에 저장된 완료 기록이 없습니다._');
    return lines.join('\n');
  }

  days.forEach((day) => {
    lines.push(`## ${day.label}`);
    if (!day.items.length) {
      lines.push('_신규 항목 없음 (이미 다른 날에 기록됨)_');
    } else {
      day.items.forEach((item) => {
        lines.push(formatSummaryLine(item.text, item.depth));
      });
    }
    lines.push('');
  });

  lines.push('---', '');
  lines.push(`기록 일수: ${dayCount}일`);
  lines.push(`전체 항목: ${totalRaw}건 · **중복 제거: ${uniqueCount}건**`);
  return lines.join('\n');
}

function renderReportJournal(dayRecords, rangeMeta, id) {
  const journalEl = document.getElementById('report-journal');
  if (!journalEl) return;

  const { days, uniqueCount, totalRaw, dayCount } = processPeriodReport(dayRecords);
  const periodLabel = getPeriodTypeLabel(rangeMeta.periodType);
  const rangeLabel = formatPeriodRangeLabel(rangeMeta.startKey, rangeMeta.endKey);

  let html = `
    <header class="journal-header">
      <p class="journal-kicker">${escapeHtml(periodLabel)} 완료 기록</p>
      <h1 class="journal-title">${escapeHtml(rangeLabel)}</h1>
      <p class="journal-meta">메모 · ${escapeHtml(id)}</p>
    </header>
  `;

  if (!dayCount) {
    html += '<p class="journal-empty">이 기간에 저장된 완료 기록이 없습니다.</p>';
    journalEl.innerHTML = html;
    return;
  }

  days.forEach((day) => {
    html += `<section class="journal-day"><h2 class="journal-day-title">${escapeHtml(day.label)}</h2>`;
    if (!day.items.length) {
      html += '<p class="journal-day-empty">신규 항목 없음</p>';
    } else {
      html += '<ul class="journal-list">';
      day.items.forEach((item) => {
        if (item.depth === 1) {
          html += `<li class="journal-item sub"><span>${escapeHtml(item.text)}</span></li>`;
        } else {
          html += `<li class="journal-item"><span>${escapeHtml(item.text)}</span></li>`;
        }
      });
      html += '</ul>';
    }
    html += '</section>';
  });

  html += `
    <footer class="journal-footer">
      <p>기록 ${dayCount}일 · 항목 ${totalRaw}건 · <strong>중복 제거 ${uniqueCount}건</strong></p>
    </footer>
  `;
  journalEl.innerHTML = html;
}

async function refreshArchiveReportPreview() {
  const journalEl = document.getElementById('report-journal');
  const rangeLabelEl = document.getElementById('report-range-label');
  if (!journalEl || !memoId || !window.archiveReportAPI?.fetchArchivePeriod) return;

  const periodType = document.getElementById('report-period-type')?.value || 'week';
  const refInput = document.getElementById('report-ref-date')?.value;
  const refDate = refInput ? getKSTDateFromKey(refInput) : getKSTDate();
  const weekStartDay = Number(
    document.querySelector('#report-week-start .day-btn.active')?.dataset.day ?? 2,
  );

  lastReportMeta = getPeriodRange(periodType, refDate, weekStartDay);
  if (rangeLabelEl) {
    rangeLabelEl.textContent = formatPeriodRangeLabel(lastReportMeta.startKey, lastReportMeta.endKey);
  }

  const dayRecords = await window.archiveReportAPI.fetchArchivePeriod(
    memoId,
    lastReportMeta.startKey,
    lastReportMeta.endKey,
  );
  lastReportText = buildPeriodReportText(dayRecords, lastReportMeta, memoId);
  renderReportJournal(dayRecords, lastReportMeta, memoId);
}

function updateReportWeekStartVisibility() {
  const row = document.getElementById('report-week-start-row');
  const periodType = document.getElementById('report-period-type')?.value;
  if (row) row.classList.toggle('hidden', periodType !== 'week');
}

function init() {
  const refDateEl = document.getElementById('report-ref-date');
  if (refDateEl) refDateEl.value = getTodayKey();

  document.getElementById('report-period-type')?.addEventListener('change', () => {
    updateReportWeekStartVisibility();
    refreshArchiveReportPreview();
  });
  document.getElementById('report-ref-date')?.addEventListener('change', refreshArchiveReportPreview);
  document.querySelectorAll('#report-week-start .day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#report-week-start .day-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      refreshArchiveReportPreview();
    });
  });

  document.getElementById('btn-report-close')?.addEventListener('click', () => {
    window.archiveReportAPI?.close();
  });

  document.getElementById('btn-report-save')?.addEventListener('click', async () => {
    if (!lastReportMeta || !memoId || !window.archiveReportAPI?.savePeriodReport) return;
    await refreshArchiveReportPreview();
    const fileName = getPeriodReportFileName(lastReportMeta);
    await window.archiveReportAPI.savePeriodReport(memoId, fileName, lastReportText);
    const btn = document.getElementById('btn-report-save');
    const orig = btn.textContent;
    btn.textContent = '저장됨!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });

  document.getElementById('btn-report-copy')?.addEventListener('click', async () => {
    const text = lastReportText || '';
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('btn-report-copy');
      const orig = btn.textContent;
      btn.textContent = '복사됨!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch {
      /* clipboard unavailable */
    }
  });

  updateReportWeekStartVisibility();

  window.archiveReportAPI?.onMemoId((id) => {
    memoId = id;
    if (refDateEl) refDateEl.value = getTodayKey();
    document.title = `Memos · 완료 기록 (${id})`;
    refreshArchiveReportPreview();
  });
}

init();
