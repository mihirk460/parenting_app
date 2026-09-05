// Two tiny games that pay a few points, capped per day in settings.
import { awardGamePoints, gamePointsToday, S } from './store.js';
import { on, toast } from './ui.js';

export function gamesMenu(kid) {
  const cap = S().settings.gameDailyCap;
  const earned = gamePointsToday(kid.id);
  return `
    <p class="muted">Game points today: <strong>${earned} / ${cap}</strong></p>
    <div class="game-grid">
      <button class="game-card" data-game="math"><span class="avatar">🧮</span><div class="title">Quick Math</div><div class="muted">+1 per correct</div></button>
      <button class="game-card" data-game="memory"><span class="avatar">🃏</span><div class="title">Memory Match</div><div class="muted">+5 to win</div></button>
    </div>`;
}

export function startGame(name, container, kid, onExit) {
  if (name === 'math') mathGame(container, kid, onExit);
  if (name === 'memory') memoryGame(container, kid, onExit);
}

function finish(container, kid, points, summary, onExit) {
  const granted = awardGamePoints(kid.id, points);
  container.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:48px">🎉</div>
      <h2>${summary}</h2>
      <p class="points" style="font-size:22px">+${granted} points</p>
      ${granted < points ? '<p class="muted">Daily game limit reached. Do some tasks for more!</p>' : ''}
      <button class="btn block" data-exit>Back to games</button>
    </div>`;
  on(container, 'click', '[data-exit]', onExit);
}

// ---- Quick Math: 10 questions, add/subtract within 20 ----
function mathGame(container, kid, onExit) {
  const total = 10;
  let n = 0;
  let correct = 0;

  function question() {
    const a = Math.floor(Math.random() * 15) + 1;
    const b = Math.floor(Math.random() * 15) + 1;
    const add = Math.random() < 0.5 || a < b;
    const q = add ? `${a} + ${b}` : `${a} - ${b}`;
    const ans = add ? a + b : a - b;
    const options = new Set([ans]);
    while (options.size < 4) options.add(Math.max(0, ans + Math.floor(Math.random() * 9) - 4));
    return { q, ans, options: [...options].sort(() => Math.random() - 0.5) };
  }

  function draw() {
    if (n >= total) return finish(container, kid, correct, `${correct} / ${total} correct!`, onExit);
    const { q, ans, options } = question();
    container.innerHTML = `
      <div class="card">
        <div class="row"><span class="muted">Question ${n + 1} of ${total}</span><span class="grow"></span><span class="points">${correct} ✓</span></div>
        <div class="question">${q} = ?</div>
        <div class="choices">${options.map((o) => `<button class="btn ghost" data-ans="${o}">${o}</button>`).join('')}</div>
        <button class="btn sm neutral block" data-exit style="margin-top:14px">Quit</button>
      </div>`;
    container.querySelectorAll('[data-ans]').forEach((b) => b.onclick = () => {
      if (Number(b.dataset.ans) === ans) { correct++; toast('Correct! ✓'); } else { toast(`Nope, it was ${ans}`); }
      n++;
      draw();
    });
    container.querySelector('[data-exit]').onclick = onExit;
  }
  draw();
}

// ---- Memory Match: 6 pairs ----
function memoryGame(container, kid, onExit) {
  const emojis = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦄', '🐙', '🦋'].sort(() => Math.random() - 0.5).slice(0, 6);
  const cards = [...emojis, ...emojis].sort(() => Math.random() - 0.5).map((e, i) => ({ id: i, e, up: false, done: false }));
  let open = [];
  let moves = 0;
  let lock = false;

  function draw() {
    container.innerHTML = `
      <div class="card">
        <div class="row"><span class="muted">Moves: ${moves}</span><span class="grow"></span><button class="btn sm neutral" data-exit>Quit</button></div>
        <div class="memory-grid" style="margin-top:12px">
          ${cards.map((c) => `<button class="memory-card ${c.up || c.done ? 'up' : ''} ${c.done ? 'done' : ''}" data-id="${c.id}">${c.e}</button>`).join('')}
        </div>
      </div>`;
    container.querySelector('[data-exit]').onclick = onExit;
    container.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => flip(cards[Number(b.dataset.id)]));
  }

  function flip(card) {
    if (lock || card.up || card.done) return;
    card.up = true;
    open.push(card);
    if (open.length === 2) {
      moves++;
      lock = true;
      const [a, b] = open;
      setTimeout(() => {
        if (a.e === b.e) { a.done = b.done = true; } else { a.up = b.up = false; }
        open = [];
        lock = false;
        if (cards.every((c) => c.done)) return finish(container, kid, 5, `Matched all in ${moves} moves!`, onExit);
        draw();
      }, a.e === b.e ? 250 : 700);
    }
    draw();
  }
  draw();
}
