const titleEl = document.getElementById('alarm-title');
const bodyEl = document.getElementById('alarm-body');

function dismiss() {
  window.alarmPopupAPI?.dismiss();
}

document.getElementById('btn-ok').addEventListener('click', dismiss);
document.getElementById('btn-close').addEventListener('click', dismiss);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
});

function showAlarm({ title, content }) {
  titleEl.textContent = title || '알람';
  const text = (content || '').trim();
  bodyEl.textContent = text.length > 500 ? text.slice(0, 500) + '…' : (text || '(내용 없음)');
}

window.alarmPopupAPI?.onAlarmData(showAlarm);
window.alarmPopupAPI?.signalReady();
