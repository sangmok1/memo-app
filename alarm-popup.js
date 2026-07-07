const AUTO_DISMISS_MS = 5 * 60 * 1000;

const titleEl = document.getElementById('alarm-title');
const bodyEl = document.getElementById('alarm-body');
let dismissTimer = null;

function dismiss() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  window.alarmPopupAPI?.dismiss();
}

document.getElementById('btn-ok').addEventListener('click', dismiss);
document.getElementById('btn-close').addEventListener('click', dismiss);

window.alarmPopupAPI?.onAlarmData(({ title, content }) => {
  titleEl.textContent = title || '알람';
  bodyEl.textContent = content?.trim() || '(내용 없음)';
  dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
});
