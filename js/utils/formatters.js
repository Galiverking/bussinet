// Utility functions - formatters and helpers

export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getPhones(str) {
  if (!str) return [];
  return str
    .split(/[\\, /]+/)
    .filter((p) => p.replace(/[^\d]/g, '').length >= 9);
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function genId() {
  return crypto.randomUUID();
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

let _toastTimer = null;
export function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;

  const bord = {
    ok: 'rgba(34,197,94,0.35)',
    err: 'rgba(239,68,68,0.35)',
    info: 'rgba(59,130,246,0.35)',
    warn: 'rgba(249,115,22,0.35)',
  };
  el.style.borderColor = bord[type] || bord.info;
  el.textContent = msg;
  el.classList.remove('hide');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hide'), 2600);
}

export function updateClock() {
  const now = new Date();
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

export function formatETAClock(etaTime) {
  return `~${String(etaTime.getHours()).padStart(2, '0')}:${String(etaTime.getMinutes()).padStart(2, '0')} น.`;
}

export function formatThaiDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

export function formatThaiDateTime(dateStr) {
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
