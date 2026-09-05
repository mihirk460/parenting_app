// Boot (optional cloud login) + hash router + role picker + PIN screen.
import { S, kidById, initStore, setSaveHook, adoptRemote } from './store.js';
import { esc, mount, on, toast, session, go } from './ui.js';
import { kidView, stopChat } from './kid.js';
import { parentView } from './parent.js';
import * as cloud from './cloud.js';

function rolePicker() {
  const user = cloud.enabled ? cloud.currentUser() : null;
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
      ${user ? `<p class="muted" style="text-align:center;margin-top:24px">${esc(user.email)} · <a href="#" data-signout>Sign out</a></p>` : ''}
    </div>`);
  on(root, 'click', '[data-kid]', (el) => { session.kidId = el.dataset.kid; go('#/kid'); });
  on(root, 'click', '[data-parent]', () => go('#/parent'));
  on(root, 'click', '[data-signout]', (el, e) => { e.preventDefault(); cloud.signOut(); });
}

export function loginScreen(mode = 'signin') {
  const signup = mode === 'signup';
  const root = mount(`
    <div class="screen no-tabs">
      <div style="text-align:center;margin-top:8vh">
        <div style="font-size:64px">🏆</div>
        <h1>Chore Quest</h1>
        <p class="muted">${signup ? 'Create a parent account' : 'Parent sign in'}</p>
      </div>
      <form id="f" class="card" style="margin-top:20px">
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" inputmode="email"></label>
        <label class="field"><span>Password</span><input name="password" type="password" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
        <p class="muted" id="err" style="color:var(--bad)"></p>
        <button class="btn block" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
      </form>
      <p class="muted" style="text-align:center">
        ${signup ? 'Already have an account? <a href="#" data-mode="signin">Sign in</a>' : 'New here? <a href="#" data-mode="signup">Create account</a> · <a href="#" data-reset>Forgot password?</a>'}
      </p>
    </div>`);
  const err = root.querySelector('#err');
  const form = root.querySelector('#f');
  on(root, 'click', '[data-mode]', (el, e) => { e.preventDefault(); loginScreen(el.dataset.mode); });
  on(root, 'click', '[data-reset]', async (el, e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) return (err.textContent = 'Type your email first, then tap Forgot password.');
    try { await cloud.resetPassword(email); toast('Reset email sent'); } catch (ex) { err.textContent = cloud.friendlyError(ex); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const email = form.email.value.trim();
      const pw = form.password.value;
      await (signup ? cloud.signUp(email, pw) : cloud.signIn(email, pw));
      // onAuth takes over from here.
    } catch (ex) {
      err.textContent = cloud.friendlyError(ex);
      btn.disabled = false;
    }
  });
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

export function route() {
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

let routing = false;
function start() {
  if (!routing) { window.addEventListener('hashchange', route); routing = true; }
  route();
}

function splash(text) {
  mount(`<div class="screen no-tabs"><div class="empty" style="margin-top:30vh"><div class="big">🏆</div>${text}</div></div>`);
}

async function boot() {
  if (!cloud.enabled) { initStore('chore-quest-v1'); return start(); }

  splash('Loading…');
  try {
    await cloud.init();
  } catch (e) {
    console.warn('Cloud unavailable, running local-only', e);
    initStore('chore-quest-v1');
    return start();
  }

  let unwatch = null;
  cloud.onAuth(async (user) => {
    unwatch?.();
    unwatch = null;
    setSaveHook(null);
    session.parent = false;
    session.kidId = null;

    if (!user) {
      window.removeEventListener('hashchange', route);
      routing = false;
      history.replaceState(null, '', '#/');
      return loginScreen();
    }

    initStore(`chore-quest-v1:${user.uid}`);
    let remote = null;
    try { remote = await cloud.loadFamily(user.uid); } catch (e) { console.warn('Could not load from cloud', e); }
    if (remote) adoptRemote(remote);
    setSaveHook((s) => cloud.saveFamily(user.uid, s));
    if (!remote) cloud.saveFamily(user.uid, S()); // first sign-in: push the starter data up
    unwatch = cloud.watchFamily(user.uid, (data) => { adoptRemote(data); route(); });
    start();
  });
}

boot();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
