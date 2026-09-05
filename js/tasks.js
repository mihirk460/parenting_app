// Recurrence + status logic. A "task" is a rule; an "occurrence" is a task on a
// specific date. Completions are keyed by (taskId, date).
import { S, completionFor, parseDate, today, addDays } from './store.js';

export const REPEAT_LABEL = { once: 'One time', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

export function isDue(task, date) {
  if (date < task.start) return false;
  if (task.end && date > task.end) return false;
  if (task.repeat === 'once') return date === task.start;
  if (task.repeat === 'daily') return true;
  const d = parseDate(date);
  const s = parseDate(task.start);
  if (task.repeat === 'weekly') return d.getDay() === s.getDay();
  if (task.repeat === 'monthly') return d.getDate() === s.getDate();
  return false;
}

// Status of one occurrence: 'open' | 'submitted' | 'approved' | 'rejected' | 'missed'
export function occurrenceStatus(task, date) {
  const c = completionFor(task.id, date);
  if (c) return c.status;
  return date < today() ? 'missed' : 'open';
}

export function occurrencesOn(kidId, date) {
  return S().tasks
    .filter((t) => t.kidId === kidId && isDue(t, date))
    .map((task) => ({ task, date, status: occurrenceStatus(task, date), completion: completionFor(task.id, date) }));
}

// Kid stats used on the parent's kid page.
export function kidStats(kidId) {
  const t = today();
  const all = S().completions.filter((c) => c.kidId === kidId);
  const approved = all.filter((c) => c.status === 'approved');
  const weekStart = addDays(t, -6);
  const approvedThisWeek = approved.filter((c) => c.date >= weekStart && c.date <= t).length;

  let dueThisWeek = 0;
  for (let i = 6; i >= 0; i--) dueThisWeek += occurrencesOn(kidId, addDays(t, -i)).length;

  // Streak: consecutive days (ending today or yesterday) where every due task was approved.
  let streak = 0;
  let day = t;
  const todayOcc = occurrencesOn(kidId, t);
  const todayDone = todayOcc.length > 0 && todayOcc.every((o) => o.status === 'approved');
  if (!todayDone) day = addDays(t, -1);
  for (let i = 0; i < 365; i++) {
    const occ = occurrencesOn(kidId, day);
    if (occ.length === 0 || !occ.every((o) => o.status === 'approved')) break;
    streak++;
    day = addDays(day, -1);
  }

  const reviewed = all.filter((c) => c.status === 'approved' || c.status === 'rejected').length;
  return {
    totalApproved: approved.length,
    approvedThisWeek,
    dueThisWeek,
    weekRate: dueThisWeek ? Math.round((approvedThisWeek / dueThisWeek) * 100) : null,
    approvalRate: reviewed ? Math.round((approved.length / reviewed) * 100) : null,
    pointsEarned: approved.reduce((a, c) => a + (c.points || 0), 0),
    streak,
  };
}
