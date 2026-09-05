// Hash router + role picker + PIN screen.
import { S, kidById } from './store.js';
import { esc, mount, on, session, go } from './ui.js';
import { kidView, stopChat } from './kid.js';
import { parentView } from './parent.js';

function rolePicker() {
  const root = mount(`
    <div class="screen no-tabs">
      <div style="text-align:center;margin-top:8vh">
        <div style="font-size:64px">🏆</div>
        <h1>Chore Quest</h1>
        <p class="muted">Who's here?</p>
      </div>
      <div class="role-grid">
        ${S().kids.map((k) => `<button class="role-btn" data-kid="${k.id}"><span class="avatar">${k.avatar}</span>${esc(k.name)}</button>`).join('')}
        <button class="role-btn parent" data-parent><span class="avatar">🔐</span>Parent</button>
      </div>
    </div>`);
  on(root, 'click', '[data-kid]', (el) => { session.kidId = el.dataset.kid; go('#/kid'); });
  on(root, 'click', '[data-parent]', () => go('#/parent'));
}

function pinScreen() {
  let entered = '';
  const root = mount(`
    <div class="screen no-tabs">
      <div class="topbar"><a href="#/" class="btn sm neutral">‹</a><h1>Parent PIN</h1></div>
      <div class="pin-dots" id="dots"></div>
      <div class="pin-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
        <button data-n="del">⌫</button><button data-n="0">0</button><button data-n="ok">OK</button>
      </div>
      <p class="muted" style="text-align:center;margin-top:20px">Default PIN is 0000. Change it in Settings.</p>
    </div>`);
  const dots = root.querySelector('#dots');
  const pin = S().settings.pin;
  const draw = () => {
    dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < entered.length ? 'on' : ''}"></span>`).join('');
  };
  const check = () => {
    if (entered === pin) { session.parent = true; parentView([]); return; }
    dots.classList.add('shake');
    setTimeout(() => dots.classList.remove('shake'), 400);
    entered = '';
    draw();
  };
  on(root, 'click', '[data-n]', (el) => {
    const n = el.dataset.n;
    if (n === 'del') entered = entered.slice(0, -1);
    else if (n === 'ok') return check();
    else if (entered.length < 8) entered += n;
    draw();
    if (entered.length === pin.length) check();
  });
  draw();
}

function route() {
  stopChat();
  const parts = (location.hash || '#/').slice(2).split('/').filter(Boolean);
  if (parts[0] === 'kid') {
    const kid = kidById(session.kidId);
    if (!kid) { session.kidId = null; return go('#/'); }
    return kidView(parts[1] || '', kid);
  }
  if (parts[0] === 'parent') {
    return session.parent ? parentView(parts.slice(1)) : pinScreen();
  }
  rolePicker();
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
