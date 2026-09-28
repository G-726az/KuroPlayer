/* Utilidades compartidas */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cssUrl(u) { return u ? `url('${String(u).replace(/'/g, '%27').replace(/"/g, '%22')}')` : 'none'; }

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
function fmtSize(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i >= 2 ? 1 : 0) + ' ' + u[i];
}
function fmtAgo(ts) {
  if (!ts) return '';
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'hace un momento';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  if (d < 86400 * 30) return `hace ${Math.floor(d / 86400)} días`;
  return new Date(ts).toLocaleDateString('es');
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function hashGradient(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 50 + (h >> 8) % 80) % 360;
  return `linear-gradient(160deg, hsl(${a} 55% 32%), hsl(${b} 65% 20%))`;
}

function toast(msg, ms = 2600) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, ms);
}

function setRangeFill(input) {
  const min = +input.min || 0, max = +input.max || 1;
  input.style.setProperty('--p', ((input.value - min) / (max - min)) * 100 + '%');
}

function epLabel(ep) {
  return ep.num != null ? `Episodio ${ep.num}` : ep.title;
}

function closeCtxMenu() { $$('.ctx-menu').forEach((m) => m.remove()); }
function ctxMenu(x, y, items) {
  closeCtxMenu();
  const m = document.createElement('div');
  m.className = 'ctx-menu glass';
  for (const it of items) {
    if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.innerHTML = `<svg class="i"><use href="#${it.icon || 'i-chev-r'}"/></svg>${esc(it.label)}`;
    b.onclick = () => { closeCtxMenu(); it.action(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.ctx-menu')) closeCtxMenu(); });
