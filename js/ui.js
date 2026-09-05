// Tiny view helpers. Views build HTML strings, mount them, then bind events.

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function mount(html) {
  const app = document.getElementById('app');
  app.innerHTML = html;
  window.scrollTo(0, 0);
  return app;
}

// Delegated event binding: on(root, 'click', '[data-x]', (el, ev) => ...)
export function on(root, event, selector, handler) {
  root.addEventListener(event, (ev) => {
    const el = ev.target.closest(selector);
    if (el && root.contains(el)) handler(el, ev);
  });
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

export function modal(innerHtml) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${innerHtml}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  on(bg, 'click', '[data-close]', close);
  return { root: bg.firstElementChild, close };
}

export function tabbar(items, current) {
  return `<nav class="tabbar">${items.map((it) => `
    <a href="${it.href}" class="${current === it.href ? 'active' : ''}">
      <span class="ico">${it.icon}</span>${esc(it.label)}
      ${it.badge ? `<span class="badge">${it.badge}</span>` : ''}
    </a>`).join('')}</nav>`;
}

export function statusPill(status) {
  const map = {
    open: ['gray', 'To do'], submitted: ['warn', 'Waiting'], approved: ['good', 'Done'],
    rejected: ['bad', 'Try again'], missed: ['bad', 'Missed'],
  };
  const [cls, label] = map[status] || ['gray', status];
  return `<span class="pill ${cls}">${label}</span>`;
}

export function prettyDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Who is using the phone right now. sessionStorage so parent mode re-locks
// when the app is fully closed, but survives tab switches.
export const session = {
  get kidId() { return sessionStorage.getItem('kidId'); },
  set kidId(v) { v ? sessionStorage.setItem('kidId', v) : sessionStorage.removeItem('kidId'); },
  get parent() { return sessionStorage.getItem('parent') === '1'; },
  set parent(v) { v ? sessionStorage.setItem('parent', '1') : sessionStorage.removeItem('parent'); },
};

export function go(hash) { location.hash = hash; }
