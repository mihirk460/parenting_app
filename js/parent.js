// Parent interface: approvals, per-kid stats and tasks, calendar, rewards, settings.
import {
  S, kidById, taskById, addKid, updateKid, removeKid, addTask, updateTask, removeTask,
  reviewCompletion, pendingCompletions, reviewRedemption, pendingRedemptions, addReward, removeReward,
  updateSettings, exportJSON, importJSON, resetAll, today, DEFAULT_REWARDS,
} from './store.js';
import { occurrencesOn, kidStats, REPEAT_LABEL } from './tasks.js';
import { esc, mount, on, toast, modal, tabbar, statusPill, prettyDate, session, go } from './ui.js';
import { mountCalendar } from './calendar.js';
import { provider, DEFAULT_OPENROUTER_MODEL } from './chat.js';
import * as cloud from './cloud.js';

const AVATARS = ['🦊', '🐼', '🦄', '🐸', '🐯', '🐙', '🦖', '🐨', '🐵', '🦋', '🐶', '🐱'];

function tabs() {
  const pending = pendingCompletions().length + pendingRedemptions().length;
  return tabbar([
    { href: '#/parent', icon: '👨‍👧', label: 'Kids', badge: pending || '' },
    { href: '#/parent/calendar', icon: '📅', label: 'Calendar' },
    { href: '#/parent/rewards', icon: '🎁', label: 'Rewards' },
    { href: '#/parent/settings', icon: '⚙️', label: 'Settings' },
  ], location.hash === '#/parent' || location.hash.startsWith('#/parent/kid') ? '#/parent' : location.hash);
}

function shell(title, body, back) {
  return `
    <div class="screen">
      <div class="topbar">
        ${back ? `<a href="${back}" class="btn sm neutral">‹</a>` : ''}
        <h1>${title}</h1>
        <button class="btn sm neutral" data-lock>🔒 Lock</button>
      </div>
      ${body}
    </div>${tabs()}`;
}

function bindCommon(root, rerender) {
  on(root, 'click', '[data-lock]', () => { session.parent = false; go('#/'); });
  on(root, 'click', '[data-review]', (el) => {
    reviewCompletion(el.dataset.review, el.dataset.ok === '1');
    toast(el.dataset.ok === '1' ? 'Approved ⭐' : 'Sent back');
    rerender();
  });
  on(root, 'click', '[data-redeem]', (el) => {
    reviewRedemption(el.dataset.redeem, el.dataset.ok === '1');
    toast(el.dataset.ok === '1' ? 'Reward approved 🎉' : 'Denied, points refunded');
    rerender();
  });
}

function approvalRows(list) {
  if (!list.length) return '<p class="muted">Nothing waiting.</p>';
  return list.map((c) => {
    const task = taskById(c.taskId);
    const kid = kidById(c.kidId);
    return `
      <div class="list-item">
        <div class="grow">
          <div class="title">${esc(task?.title || 'Deleted task')}</div>
          <div class="sub">${kid?.avatar || ''} ${esc(kid?.name || '')} · ${prettyDate(c.date)} · +${task?.points ?? 0} pts</div>
        </div>
        <button class="btn sm bad" data-review="${c.id}" data-ok="0">✕</button>
        <button class="btn sm good" data-review="${c.id}" data-ok="1">✓</button>
      </div>`;
  }).join('');
}

function redemptionRows(list) {
  if (!list.length) return '<p class="muted">No reward requests.</p>';
  return list.map((r) => {
    const kid = kidById(r.kidId);
    return `
      <div class="list-item">
        <div style="font-size:26px">${r.emoji}</div>
        <div class="grow">
          <div class="title">${esc(r.title)}</div>
          <div class="sub">${kid?.avatar || ''} ${esc(kid?.name || '')} · ${r.cost} pts</div>
        </div>
        <button class="btn sm bad" data-redeem="${r.id}" data-ok="0">✕</button>
        <button class="btn sm good" data-redeem="${r.id}" data-ok="1">✓</button>
      </div>`;
  }).join('');
}

export function parentView(parts) {
  if (parts[0] === 'kid' && kidById(parts[1])) return kidPage(kidById(parts[1]));
  if (parts[0] === 'calendar') return calendarPage();
  if (parts[0] === 'rewards') return rewardsPage();
  if (parts[0] === 'settings') return settingsPage();
  return dashboard();
}

// ---- Dashboard ----
function dashboard() {
  const t = today();
  const root = mount(shell('Parent', `
    <div class="section-title"><h2>Needs approval</h2></div>
    <div class="card">${approvalRows(pendingCompletions())}</div>
    <div class="section-title"><h2>Reward requests</h2></div>
    <div class="card">${redemptionRows(pendingRedemptions())}</div>
    <div class="section-title"><h2>Kids</h2><button class="btn sm ghost" data-add-kid>+ Add kid</button></div>
    ${S().kids.map((k) => {
      const occ = occurrencesOn(k.id, t);
      const done = occ.filter((o) => o.status === 'approved').length;
      const st = kidStats(k.id);
      return `
        <a href="#/parent/kid/${k.id}" class="card row" style="text-decoration:none;color:inherit">
          <div style="font-size:40px">${k.avatar}</div>
          <div class="grow">
            <div class="title" style="font-weight:700">${esc(k.name)}</div>
            <div class="muted">Today ${done}/${occ.length} · 🔥 ${st.streak} day streak</div>
          </div>
          <span class="points">⭐ ${k.points}</span>
        </a>`;
    }).join('') || '<div class="empty">Add your first kid to get started.</div>'}
  `));
  bindCommon(root, dashboard);
  on(root, 'click', '[data-add-kid]', () => kidForm(null, dashboard));
}

// ---- Kid detail ----
function kidPage(kid) {
  const st = kidStats(kid.id);
  const tasks = S().tasks.filter((t) => t.kidId === kid.id);
  const recent = S().completions.filter((c) => c.kidId === kid.id && c.status !== 'submitted')
    .sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0)).slice(0, 8);

  const root = mount(shell(`${kid.avatar} ${esc(kid.name)}`, `
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn sm ghost" data-edit-kid>Edit kid</button>
      <button class="btn sm ghost" data-give>Give bonus points</button>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="val">⭐ ${kid.points}</div><div class="lbl">Points balance</div></div>
      <div class="stat"><div class="val">🔥 ${st.streak}</div><div class="lbl">Day streak</div></div>
      <div class="stat"><div class="val">${st.approvedThisWeek}/${st.dueThisWeek}</div><div class="lbl">Done this week${st.weekRate !== null ? ` (${st.weekRate}%)` : ''}</div></div>
      <div class="stat"><div class="val">${st.totalApproved}</div><div class="lbl">Tasks done all time</div></div>
    </div>

    <div class="section-title"><h2>Needs approval</h2></div>
    <div class="card">${approvalRows(pendingCompletions(kid.id))}</div>
    <div class="section-title"><h2>Reward requests</h2></div>
    <div class="card">${redemptionRows(pendingRedemptions(kid.id))}</div>

    <div class="section-title"><h2>Tasks</h2><button class="btn sm ghost" data-add-task>+ Add task</button></div>
    <div class="card">
      ${tasks.length ? tasks.map((t) => `
        <div class="list-item" data-task="${t.id}" style="cursor:pointer">
          <div class="grow">
            <div class="title">${esc(t.title)}</div>
            <div class="sub">${REPEAT_LABEL[t.repeat]} · from ${prettyDate(t.start)}${t.end ? ` to ${prettyDate(t.end)}` : ''}</div>
          </div>
          <span class="points">+${t.points}</span>
        </div>`).join('') : '<p class="muted">No tasks yet. Add one!</p>'}
    </div>

    <div class="section-title"><h2>Recent</h2></div>
    <div class="card">
      ${recent.length ? recent.map((c) => `
        <div class="list-item">
          <div class="grow"><div class="title">${esc(taskById(c.taskId)?.title || 'Deleted task')}</div><div class="sub">${prettyDate(c.date)}</div></div>
          ${statusPill(c.status)}
        </div>`).join('') : '<p class="muted">No reviewed tasks yet.</p>'}
    </div>
  `, '#/parent'));

  const rerender = () => kidPage(kidById(kid.id));
  bindCommon(root, rerender);
  on(root, 'click', '[data-add-task]', () => taskForm({ kidId: kid.id }, rerender));
  on(root, 'click', '[data-task]', (el) => taskForm(taskById(el.dataset.task), rerender));
  on(root, 'click', '[data-edit-kid]', () => kidForm(kid, () => (kidById(kid.id) ? rerender() : go('#/parent'))));
  on(root, 'click', '[data-give]', () => {
    const n = Number(prompt('How many bonus points?', '5'));
    if (n) { updateKid(kid.id, { points: kid.points + n }); toast(`+${n} points`); rerender(); }
  });
}

// ---- Task form (add or edit) ----
function taskForm(task, done) {
  const editing = Boolean(task?.id);
  const t = { title: '', points: 2, repeat: 'daily', start: today(), end: '', ...task };
  const { root, close } = modal(`
    <h2>${editing ? 'Edit task' : 'New task'}</h2>
    <form id="f">
      <label class="field"><span>Task</span><input name="title" type="text" required value="${esc(t.title)}" placeholder="e.g. Feed the dog"></label>
      <div class="field-row">
        <label class="field"><span>Points</span><input name="points" type="number" min="0" required value="${t.points}"></label>
        <label class="field"><span>Kid</span><select name="kidId">${S().kids.map((k) => `<option value="${k.id}" ${k.id === t.kidId ? 'selected' : ''}>${k.avatar} ${esc(k.name)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Repeat</span></label>
      <div class="checks" style="margin:-8px 0 12px">
        ${Object.entries(REPEAT_LABEL).map(([v, l]) => `<button type="button" class="chip ${t.repeat === v ? 'on' : ''}" data-rep="${v}">${l}</button>`).join('')}
      </div>
      <div class="field-row">
        <label class="field"><span>Start</span><input name="start" type="date" required value="${t.start}"></label>
        <label class="field"><span>End (optional)</span><input name="end" type="date" value="${t.end || ''}"></label>
      </div>
      <p class="muted" id="hint"></p>
      <div class="btn-row">
        ${editing ? '<button type="button" class="btn bad" data-del>Delete</button>' : ''}
        <button type="button" class="btn neutral" data-close>Cancel</button>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>`);
  let repeat = t.repeat;
  const hint = root.querySelector('#hint');
  const updateHint = () => {
    hint.textContent = repeat === 'once' ? 'Due on the start date.'
      : repeat === 'daily' ? 'Due every day between the dates.'
      : repeat === 'weekly' ? 'Due every week on the same weekday as the start date.'
      : 'Due every month on the same day of the month as the start date.';
  };
  updateHint();
  on(root, 'click', '[data-rep]', (el) => {
    repeat = el.dataset.rep;
    root.querySelectorAll('[data-rep]').forEach((c) => c.classList.toggle('on', c === el));
    updateHint();
  });
  on(root, 'click', '[data-del]', () => {
    if (confirm('Delete this task and its history?')) { removeTask(t.id); close(); done(); }
  });
  root.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      title: fd.get('title').trim(), points: Number(fd.get('points')), kidId: fd.get('kidId'),
      repeat, start: fd.get('start'), end: fd.get('end') || null,
    };
    if (data.end && data.end < data.start) return toast('End date is before start date');
    editing ? updateTask(t.id, data) : addTask(data);
    close();
    toast('Saved');
    done();
  });
}

// ---- Kid form (add or edit) ----
function kidForm(kid, done) {
  const k = { name: '', avatar: AVATARS[0], ...kid };
  const { root, close } = modal(`
    <h2>${kid ? 'Edit kid' : 'Add kid'}</h2>
    <form id="f">
      <label class="field"><span>Name</span><input name="name" type="text" required value="${esc(k.name)}"></label>
      <label class="field"><span>Avatar</span></label>
      <div class="checks" style="margin:-8px 0 12px">
        ${AVATARS.map((a) => `<button type="button" class="chip ${a === k.avatar ? 'on' : ''}" data-av="${a}" style="font-size:22px;padding:6px 10px">${a}</button>`).join('')}
      </div>
      <div class="btn-row">
        ${kid ? '<button type="button" class="btn bad" data-del>Remove</button>' : ''}
        <button type="button" class="btn neutral" data-close>Cancel</button>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>`);
  let avatar = k.avatar;
  on(root, 'click', '[data-av]', (el) => {
    avatar = el.dataset.av;
    root.querySelectorAll('[data-av]').forEach((c) => c.classList.toggle('on', c === el));
  });
  on(root, 'click', '[data-del]', () => {
    if (confirm(`Remove ${k.name} and all their tasks?`)) { removeKid(k.id); close(); done(); }
  });
  root.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    kid ? updateKid(kid.id, { name, avatar }) : addKid(name, avatar);
    close();
    done();
  });
}

// ---- Calendar (all kids or one) ----
let calKid = 'all';
function calendarPage() {
  const kids = S().kids;
  const root = mount(shell('Calendar', `
    <div class="checks" style="margin-bottom:12px">
      <button class="chip ${calKid === 'all' ? 'on' : ''}" data-kid="all">Everyone</button>
      ${kids.map((k) => `<button class="chip ${calKid === k.id ? 'on' : ''}" data-kid="${k.id}">${k.avatar} ${esc(k.name)}</button>`).join('')}
    </div>
    <div class="card" id="cal"></div>
    <div class="card" id="day"></div>
    <p class="muted">🟢 done · 🟠 waiting · 🔴 missed · 🟣 to do</p>`));
  const selectedKids = () => (calKid === 'all' ? kids : kids.filter((k) => k.id === calKid));
  const day = root.querySelector('#day');
  let currentDay = today();
  const cal = mountCalendar(root.querySelector('#cal'), {
    dotsFor: (d) => selectedKids().flatMap((k) => occurrencesOn(k.id, d).map((o) => o.status)),
    onSelect: (d) => {
      currentDay = d;
      const rows = selectedKids().flatMap((k) => occurrencesOn(k.id, d).map((o) => ({ ...o, kid: k })));
      day.innerHTML = `<div class="row"><h3 class="grow">${prettyDate(d)}</h3><button class="btn sm ghost" data-add-on="${d}">+ Task</button></div>` +
        (rows.length ? rows.map((o) => `
          <div class="list-item">
            <div style="font-size:24px">${o.kid.avatar}</div>
            <div class="grow"><div class="title">${esc(o.task.title)}</div><div class="sub">${esc(o.kid.name)} · ${o.task.points} pts</div></div>
            ${o.status === 'submitted'
              ? `<button class="btn sm bad" data-review="${o.completion.id}" data-ok="0">✕</button><button class="btn sm good" data-review="${o.completion.id}" data-ok="1">✓</button>`
              : statusPill(o.status)}
          </div>`).join('') : '<p class="muted">Nothing on this day.</p>');
    },
  });
  const rerender = () => { cal.redraw(); root.querySelector(`[data-date="${currentDay}"]`)?.click(); };
  bindCommon(root, rerender);
  on(root, 'click', '[data-kid]', (el) => { calKid = el.dataset.kid; calendarPage(); });
  on(root, 'click', '[data-add-on]', (el) => {
    if (!kids.length) return toast('Add a kid first');
    taskForm({ kidId: calKid === 'all' ? kids[0].id : calKid, start: el.dataset.date, repeat: 'once' }, rerender);
  });
}

// ---- Rewards catalog ----
function rewardsPage() {
  const history = S().redemptions.filter((r) => r.status !== 'requested').slice().reverse().slice(0, 10);
  const root = mount(shell('Rewards', `
    <div class="section-title"><h2>Requests</h2></div>
    <div class="card">${redemptionRows(pendingRedemptions())}</div>
    <div class="section-title"><h2>Catalog</h2></div>
    <div class="card">
      ${S().rewards.map((r) => `
        <div class="list-item">
          <div style="font-size:28px">${r.emoji}</div>
          <div class="grow"><div class="title">${esc(r.title)}</div><div class="sub">${r.cost} points</div></div>
          <button class="btn sm neutral" data-del-reward="${r.id}">🗑</button>
        </div>`).join('') || '<p class="muted">No rewards yet.</p>'}
    </div>
    <div class="card">
      <h3>Add reward</h3>
      <form id="f">
        <div class="field-row">
          <label class="field" style="flex:0 0 70px"><span>Emoji</span><input name="emoji" type="text" value="🎉" maxlength="4"></label>
          <label class="field"><span>Title</span><input name="title" type="text" required placeholder="e.g. Ice cream trip"></label>
          <label class="field" style="flex:0 0 90px"><span>Cost</span><input name="cost" type="number" min="1" required value="20"></label>
        </div>
        <button class="btn block" type="submit">Add</button>
      </form>
      ${S().rewards.length ? '' : '<button class="btn sm ghost block" data-defaults style="margin-top:8px">Restore default rewards</button>'}
    </div>
    ${history.length ? `
      <div class="section-title"><h2>History</h2></div>
      <div class="card">${history.map((r) => `
        <div class="list-item">
          <div style="font-size:24px">${r.emoji}</div>
          <div class="grow"><div class="title">${esc(r.title)}</div><div class="sub">${kidById(r.kidId)?.name || ''} · ${r.cost} pts</div></div>
          <span class="pill ${r.status === 'approved' ? 'good' : 'bad'}">${r.status}</span>
        </div>`).join('')}</div>` : ''}
  `));
  bindCommon(root, rewardsPage);
  on(root, 'click', '[data-del-reward]', (el) => { removeReward(el.dataset.delReward); rewardsPage(); });
  on(root, 'click', '[data-defaults]', () => { DEFAULT_REWARDS.forEach(addReward); rewardsPage(); });
  root.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addReward({ emoji: fd.get('emoji').trim() || '🎁', title: fd.get('title').trim(), cost: Number(fd.get('cost')) });
    toast('Reward added');
    rewardsPage();
  });
}

// ---- Settings ----
function settingsPage() {
  const s = S().settings;
  const prov = provider();
  const root = mount(shell('Settings', `
    <div class="card">
      <h3>Parent PIN</h3>
      <form id="pin" class="field-row">
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" placeholder="New 4-8 digit PIN" required>
        <button class="btn" type="submit" style="flex:0 0 auto">Change</button>
      </form>
    </div>
    <div class="card">
      <h3>Buddy chat bot</h3>
      <p class="muted">Pick where Buddy's answers come from. Keys are saved with your family data, never shared with anyone else.</p>
      <label class="field"><span>Brain</span>
        <select id="provider">
          <option value="local" ${prov === 'local' ? 'selected' : ''}>Built-in stories and jokes only (free, offline)</option>
          <option value="openrouter" ${prov === 'openrouter' ? 'selected' : ''}>OpenRouter (free models available)</option>
          <option value="anthropic" ${prov === 'anthropic' ? 'selected' : ''}>Anthropic Claude (paid API key)</option>
        </select>
      </label>
      <form id="key-openrouter" class="${prov === 'openrouter' ? '' : 'hidden'}">
        <label class="field"><span>OpenRouter API key</span><input name="openrouterKey" type="password" placeholder="sk-or-…" value="${esc(s.openrouterKey || '')}" autocomplete="off"></label>
        <label class="field"><span>Model</span><input name="openrouterModel" type="text" placeholder="${DEFAULT_OPENROUTER_MODEL}" value="${esc(s.openrouterModel || '')}" autocomplete="off"></label>
        <p class="muted">Free models end in <code>:free</code>. Browse them at openrouter.ai/models (filter: Free). Leave blank for the default.</p>
        <button class="btn block" type="submit">Save</button>
      </form>
      <form id="key-anthropic" class="${prov === 'anthropic' ? '' : 'hidden'}">
        <label class="field"><span>Anthropic API key</span><input name="apiKey" type="password" placeholder="sk-ant-…" value="${esc(s.apiKey)}" autocomplete="off"></label>
        <button class="btn block" type="submit">Save</button>
      </form>
      <label class="row" style="margin-top:10px"><input type="checkbox" id="voice" ${s.voice ? 'checked' : ''}> Read Buddy's replies aloud</label>
    </div>
    <div class="card">
      <h3>Games</h3>
      <label class="field"><span>Max game points per day</span><input id="cap" type="number" min="0" value="${s.gameDailyCap}"></label>
    </div>
    <div class="card">
      <h3>Kids</h3>
      ${S().kids.map((k) => `<div class="list-item"><div style="font-size:24px">${k.avatar}</div><div class="grow title">${esc(k.name)}</div><button class="btn sm neutral" data-edit-kid="${k.id}">Edit</button></div>`).join('')}
      <button class="btn sm ghost block" data-add-kid style="margin-top:8px">+ Add kid</button>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="muted">Data lives only in this browser. Export before clearing Safari data or switching phones.</p>
      <div class="btn-row">
        <button class="btn neutral" data-export>Export</button>
        <button class="btn neutral" data-import>Import</button>
      </div>
      <input type="file" id="file" accept="application/json" class="hidden">
      <textarea id="dump" class="hidden" readonly></textarea>
    </div>
    <div class="card">
      <h3>Account</h3>
      ${cloud.enabled && cloud.currentUser()
        ? `<p class="muted">Signed in as ${esc(cloud.currentUser().email)}. Data syncs to the cloud.</p><button class="btn neutral block" data-signout>Sign out</button>`
        : '<p class="muted">Cloud sync is off. Data lives only in this browser. See README to turn it on.</p>'}
    </div>
    <div class="card">
      <button class="btn bad block" data-reset>Reset everything</button>
    </div>
  `));
  bindCommon(root, settingsPage);
  on(root, 'click', '[data-signout]', () => cloud.signOut());
  root.querySelector('#pin').addEventListener('submit', (e) => {
    e.preventDefault();
    updateSettings({ pin: new FormData(e.target).get('pin') });
    e.target.reset();
    toast('PIN changed');
  });
  root.querySelector('#provider').onchange = (e) => { updateSettings({ provider: e.target.value }); settingsPage(); };
  root.querySelector('#key-openrouter').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    updateSettings({ openrouterKey: fd.get('openrouterKey').trim(), openrouterModel: fd.get('openrouterModel').trim() });
    toast('Saved');
  });
  root.querySelector('#key-anthropic').addEventListener('submit', (e) => {
    e.preventDefault();
    updateSettings({ apiKey: new FormData(e.target).get('apiKey').trim() });
    toast('Saved');
  });
  root.querySelector('#voice').onchange = (e) => updateSettings({ voice: e.target.checked });
  root.querySelector('#cap').onchange = (e) => { updateSettings({ gameDailyCap: Number(e.target.value) || 0 }); toast('Saved'); };
  on(root, 'click', '[data-add-kid]', () => kidForm(null, settingsPage));
  on(root, 'click', '[data-edit-kid]', (el) => kidForm(kidById(el.dataset.editKid), settingsPage));
  on(root, 'click', '[data-export]', async () => {
    const text = exportJSON();
    const blob = new Blob([text], { type: 'application/json' });
    const file = new File([blob], `chore-quest-${today()}.json`, { type: 'application/json' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Chore Quest backup' }); return; } catch { /* cancelled */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
  });
  const fileInput = root.querySelector('#file');
  on(root, 'click', '[data-import]', () => fileInput.click());
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      importJSON(await f.text());
      toast('Imported');
      settingsPage();
    } catch (e) { alert(e.message); }
  };
  on(root, 'click', '[data-reset]', () => {
    if (confirm('Delete all kids, tasks, points and settings?')) { resetAll(); session.parent = false; go('#/'); }
  });
}
