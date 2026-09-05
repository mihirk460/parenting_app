// All app data lives in one localStorage object. Keep it plain JSON so
// export/import and a future backend sync stay trivial.

const KEY = 'chore-quest-v1';

export const uid = () => Math.random().toString(36).slice(2, 10);

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const today = () => toDateStr(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export const DEFAULT_REWARDS = [
  { title: 'Pizza party', cost: 50, emoji: '🍕' },
  { title: 'Movie night', cost: 40, emoji: '🎬' },
  { title: '30 min extra screen time', cost: 15, emoji: '📱' },
  { title: 'Pick dinner', cost: 20, emoji: '🍽️' },
  { title: 'Trip to the park', cost: 25, emoji: '🛝' },
];

function seed() {
  const kidId = uid();
  const t = today();
  return {
    version: 1,
    settings: { pin: '0000', apiKey: '', gameDailyCap: 20, voice: true },
    kids: [{ id: kidId, name: 'Sam', avatar: '🦊', points: 12 }],
    tasks: [
      { id: uid(), kidId, title: 'Make your bed', points: 2, start: t, end: null, repeat: 'daily' },
      { id: uid(), kidId, title: 'Brush teeth (night)', points: 1, start: t, end: null, repeat: 'daily' },
      { id: uid(), kidId, title: 'Read for 20 minutes', points: 3, start: t, end: null, repeat: 'daily' },
      { id: uid(), kidId, title: 'Tidy your room', points: 5, start: t, end: null, repeat: 'weekly' },
      { id: uid(), kidId, title: 'Finish science project', points: 15, start: t, end: addDays(t, 6), repeat: 'once' },
    ],
    completions: [],
    rewards: DEFAULT_REWARDS.map((r) => ({ id: uid(), ...r })),
    redemptions: [],
    gameLog: [],
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  const s = seed();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export const S = () => state;
export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.kids) || !Array.isArray(parsed.tasks)) {
    throw new Error('That file does not look like a Chore Quest backup.');
  }
  state = parsed;
  save();
}
export function resetAll() {
  state = seed();
  save();
}

// ---- Lookups ----
export const kidById = (id) => state.kids.find((k) => k.id === id);
export const taskById = (id) => state.tasks.find((t) => t.id === id);
export const rewardById = (id) => state.rewards.find((r) => r.id === id);
export const completionFor = (taskId, date) =>
  state.completions.find((c) => c.taskId === taskId && c.date === date);

// ---- Kids ----
export function addKid(name, avatar) {
  const kid = { id: uid(), name, avatar, points: 0 };
  state.kids.push(kid);
  save();
  return kid;
}
export function updateKid(id, patch) {
  Object.assign(kidById(id), patch);
  save();
}
export function removeKid(id) {
  state.kids = state.kids.filter((k) => k.id !== id);
  state.tasks = state.tasks.filter((t) => t.kidId !== id);
  state.completions = state.completions.filter((c) => c.kidId !== id);
  state.redemptions = state.redemptions.filter((r) => r.kidId !== id);
  save();
}

// ---- Tasks ----
export function addTask(task) {
  const t = { id: uid(), ...task };
  state.tasks.push(t);
  save();
  return t;
}
export function updateTask(id, patch) {
  Object.assign(taskById(id), patch);
  save();
}
export function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  state.completions = state.completions.filter((c) => c.taskId !== id);
  save();
}

// ---- Completions (kid ticks -> parent approves) ----
export function submitTask(taskId, date) {
  const task = taskById(taskId);
  const existing = completionFor(taskId, date);
  if (existing) {
    if (existing.status === 'approved') return existing;
    existing.status = 'submitted';
    existing.submittedAt = Date.now();
  } else {
    state.completions.push({
      id: uid(), taskId, kidId: task.kidId, date, status: 'submitted', submittedAt: Date.now(),
    });
  }
  save();
}
export function reviewCompletion(id, approve) {
  const c = state.completions.find((x) => x.id === id);
  if (!c || c.status !== 'submitted') return;
  c.status = approve ? 'approved' : 'rejected';
  c.reviewedAt = Date.now();
  if (approve) {
    const task = taskById(c.taskId);
    c.points = task ? task.points : 0;
    kidById(c.kidId).points += c.points;
  }
  save();
}
export const pendingCompletions = (kidId) =>
  state.completions.filter((c) => c.status === 'submitted' && (!kidId || c.kidId === kidId));

// ---- Rewards ----
export function addReward(r) {
  state.rewards.push({ id: uid(), ...r });
  save();
}
export function removeReward(id) {
  state.rewards = state.rewards.filter((r) => r.id !== id);
  save();
}
export function requestReward(kidId, rewardId) {
  const kid = kidById(kidId);
  const reward = rewardById(rewardId);
  if (kid.points < reward.cost) return false;
  kid.points -= reward.cost; // held until parent decides; refunded on deny
  state.redemptions.push({
    id: uid(), kidId, rewardId, title: reward.title, emoji: reward.emoji, cost: reward.cost,
    status: 'requested', createdAt: Date.now(),
  });
  save();
  return true;
}
export function reviewRedemption(id, approve) {
  const r = state.redemptions.find((x) => x.id === id);
  if (!r || r.status !== 'requested') return;
  r.status = approve ? 'approved' : 'denied';
  r.reviewedAt = Date.now();
  if (!approve) kidById(r.kidId).points += r.cost;
  save();
}
export const pendingRedemptions = (kidId) =>
  state.redemptions.filter((r) => r.status === 'requested' && (!kidId || r.kidId === kidId));

// ---- Games (small points, capped per day) ----
export function gamePointsToday(kidId) {
  const t = today();
  return state.gameLog.filter((g) => g.kidId === kidId && g.date === t).reduce((a, g) => a + g.points, 0);
}
export function awardGamePoints(kidId, amount) {
  const room = Math.max(0, state.settings.gameDailyCap - gamePointsToday(kidId));
  const granted = Math.min(room, amount);
  if (granted > 0) {
    kidById(kidId).points += granted;
    state.gameLog.push({ kidId, date: today(), points: granted, at: Date.now() });
    save();
  }
  return granted;
}

// ---- Settings ----
export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}
