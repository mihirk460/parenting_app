// Kid interface: today's tasks, calendar, games, rewards shop, Buddy chat.
import { S, submitTask, requestReward, addDays, today, pendingRedemptions } from './store.js';
import { occurrencesOn, kidStats } from './tasks.js';
import { esc, mount, on, toast, tabbar, statusPill, prettyDate, session, go } from './ui.js';
import { mountCalendar } from './calendar.js';
import { gamesMenu, startGame } from './games.js';
import { chatView } from './chat.js';

const TABS = [
  { href: '#/kid', icon: '🏠', label: 'Home' },
  { href: '#/kid/calendar', icon: '📅', label: 'Calendar' },
  { href: '#/kid/games', icon: '🎮', label: 'Games' },
  { href: '#/kid/rewards', icon: '🎁', label: 'Rewards' },
  { href: '#/kid/chat', icon: '🤖', label: 'Buddy' },
];

function shell(kid, title, body) {
  return `
    <div class="screen">
      <div class="topbar">
        <h1>${title}</h1>
        <span class="points">⭐ ${kid.points}</span>
        <button class="btn sm neutral" data-switch title="Switch user">${kid.avatar}</button>
      </div>
      ${body}
    </div>
    ${tabbar(TABS, location.hash)}`;
}

function occurrenceRow(o, { showDate = false } = {}) {
  const canTick = o.status === 'open' || o.status === 'missed' || o.status === 'rejected';
  return `
    <div class="list-item">
      <button class="task-check ${o.status}" data-tick="${o.task.id}" data-date="${o.date}" ${canTick ? '' : 'disabled'}>
        ${o.status === 'approved' ? '✓' : o.status === 'submitted' ? '⏳' : ''}
      </button>
      <div class="grow">
        <div class="title">${esc(o.task.title)}</div>
        <div class="sub">${showDate ? prettyDate(o.date) + ' · ' : ''}${o.task.points} pts</div>
      </div>
      ${statusPill(o.status)}
    </div>`;
}

function bindTicks(root, rerender) {
  on(root, 'click', '[data-tick]', (el) => {
    submitTask(el.dataset.tick, el.dataset.date);
    toast('Sent to your parent for approval ⏳');
    rerender();
  });
  on(root, 'click', '[data-switch]', () => { session.kidId = null; go('#/'); });
}

export function kidView(sub, kid) {
  if (sub === 'calendar') return calendarPage(kid);
  if (sub === 'games') return gamesPage(kid);
  if (sub === 'rewards') return rewardsPage(kid);
  if (sub === 'chat') return chatPage(kid);
  return homePage(kid);
}

function homePage(kid) {
  const t = today();
  const todays = occurrencesOn(kid.id, t);
  const done = todays.filter((o) => o.status === 'approved').length;
  const catchUp = [];
  for (let i = 1; i <= 7; i++) {
    occurrencesOn(kid.id, addDays(t, -i)).forEach((o) => {
      if (o.status === 'missed' || o.status === 'rejected') catchUp.push(o);
    });
  }
  const upcoming = [];
  for (let i = 1; i <= 7; i++) upcoming.push(...occurrencesOn(kid.id, addDays(t, i)));
  const stats = kidStats(kid.id);
  const waitingRewards = pendingRedemptions(kid.id).length;

  const root = mount(shell(kid, `Hi ${esc(kid.name)}!`, `
    <div class="hero">
      <div class="row">
        <div class="grow">
          <div class="muted">Your points</div>
          <div class="big">⭐ ${kid.points}</div>
        </div>
        <div style="text-align:right">
          <div class="muted">Streak</div>
          <div class="big">🔥 ${stats.streak}</div>
        </div>
      </div>
      <p class="muted" style="margin:10px 0 0">${todays.length ? `${done} of ${todays.length} tasks done today` : 'No tasks today. Enjoy!'}${waitingRewards ? ` · ${waitingRewards} reward request waiting` : ''}</p>
    </div>

    <div class="section-title"><h2>Today</h2><span class="muted">${prettyDate(t)}</span></div>
    <div class="card">
      ${todays.length ? todays.map((o) => occurrenceRow(o)).join('') : '<div class="empty"><div class="big">🎈</div>Nothing due today</div>'}
    </div>

    ${catchUp.length ? `
      <div class="section-title"><h2>Catch up</h2><span class="muted">still counts!</span></div>
      <div class="card">${catchUp.map((o) => occurrenceRow(o, { showDate: true })).join('')}</div>` : ''}

    ${upcoming.length ? `
      <div class="section-title"><h2>Coming up</h2></div>
      <div class="card">${upcoming.slice(0, 8).map((o) => `
        <div class="list-item">
          <div class="grow"><div class="title">${esc(o.task.title)}</div><div class="sub">${prettyDate(o.date)} · ${o.task.points} pts</div></div>
        </div>`).join('')}</div>` : ''}
  `));
  bindTicks(root, () => homePage(kid));
}

function calendarPage(kid) {
  const root = mount(shell(kid, 'Calendar', `
    <div class="card" id="cal"></div>
    <div class="card" id="day"></div>
    <p class="muted">🟢 done · 🟠 waiting · 🔴 missed · 🟣 to do</p>`));
  const day = root.querySelector('#day');
  const cal = mountCalendar(root.querySelector('#cal'), {
    dotsFor: (d) => occurrencesOn(kid.id, d).map((o) => o.status),
    onSelect: (d) => {
      const occ = occurrencesOn(kid.id, d);
      day.innerHTML = `<h3>${prettyDate(d)}</h3>` +
        (occ.length ? occ.map((o) => occurrenceRow(o)).join('') : '<p class="muted">Nothing on this day.</p>');
    },
  });
  on(root, 'click', '[data-tick]', (el) => {
    if (el.dataset.date > today()) return toast("That's in the future!");
    submitTask(el.dataset.tick, el.dataset.date);
    toast('Sent for approval ⏳');
    cal.redraw();
    root.querySelector(`[data-date="${el.dataset.date}"]`)?.click();
  });
  on(root, 'click', '[data-switch]', () => { session.kidId = null; go('#/'); });
}

function gamesPage(kid) {
  const root = mount(shell(kid, 'Games', `<div id="game">${gamesMenu(kid)}</div>`));
  const box = root.querySelector('#game');
  on(root, 'click', '[data-game]', (el) => startGame(el.dataset.game, box, kid, () => gamesPage(kid)));
  on(root, 'click', '[data-switch]', () => { session.kidId = null; go('#/'); });
}

function rewardsPage(kid) {
  const mine = S().redemptions.filter((r) => r.kidId === kid.id).slice().reverse();
  const root = mount(shell(kid, 'Rewards', `
    <div class="hero"><div class="muted">You have</div><div class="big">⭐ ${kid.points}</div><p class="muted" style="margin:8px 0 0">Ask for a reward. Your parent decides!</p></div>
    <div class="section-title"><h2>Shop</h2></div>
    <div class="card">
      ${S().rewards.map((r) => `
        <div class="list-item">
          <div style="font-size:30px">${r.emoji}</div>
          <div class="grow"><div class="title">${esc(r.title)}</div><div class="sub">${r.cost} points</div></div>
          <button class="btn sm ${kid.points >= r.cost ? '' : 'neutral'}" data-buy="${r.id}" ${kid.points >= r.cost ? '' : 'disabled'}>Ask</button>
        </div>`).join('')}
    </div>
    ${mine.length ? `
      <div class="section-title"><h2>My requests</h2></div>
      <div class="card">${mine.slice(0, 10).map((r) => `
        <div class="list-item">
          <div style="font-size:26px">${r.emoji}</div>
          <div class="grow"><div class="title">${esc(r.title)}</div><div class="sub">${r.cost} pts</div></div>
          ${r.status === 'requested' ? '<span class="pill warn">Waiting</span>' : r.status === 'approved' ? '<span class="pill good">Yes! 🎉</span>' : '<span class="pill bad">Not now</span>'}
        </div>`).join('')}</div>` : ''}
  `));
  on(root, 'click', '[data-buy]', (el) => {
    if (requestReward(kid.id, el.dataset.buy)) { toast('Asked! Waiting for your parent 🤞'); rewardsPage(kid); }
    else toast('Not enough points yet');
  });
  on(root, 'click', '[data-switch]', () => { session.kidId = null; go('#/'); });
}

let activeChat;
function chatPage(kid) {
  activeChat?.stop();
  const root = mount(shell(kid, 'Buddy', `<div id="chat"></div>`));
  activeChat = chatView(root.querySelector('#chat'), kid);
  on(root, 'click', '[data-switch]', () => { session.kidId = null; go('#/'); });
}
export function stopChat() { activeChat?.stop(); activeChat = null; }
