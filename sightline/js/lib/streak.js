// Training days and the weekly streak, on this phone only (no profile).
// Real gains come from 2–4 sessions a week over 4+ weeks, so the home screen
// shows this week's training days against that goal, and how many weeks in a
// row hit at least 2. A day with any finished Training session (Focus or
// Move) counts once. Weeks start on Monday.

export const WEEK_GOAL = [2, 4];
const KEEP_DAYS = 120;
const DAY = 86400000;

// "2026-10-15" for a date, in local time.
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The Monday of a date's week, as a day key.
export function weekKey(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
}

// days: day keys with training. Returns this week's count and the streak:
// weeks in a row with at least 2 training days, counting this week once it gets there.
export function streakOf(days, today = new Date()) {
  const perWeek = new Map();
  for (const k of new Set(days)) {
    const [y, mo, d] = k.split('-').map(Number);
    const w = weekKey(new Date(y, mo - 1, d));
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const thisWeek = perWeek.get(weekKey(today)) ?? 0;
  let streak = thisWeek >= WEEK_GOAL[0] ? 1 : 0;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let w = new Date(monday); ; ) {
    w.setDate(w.getDate() - 7);
    if ((perWeek.get(dayKey(w)) ?? 0) < WEEK_GOAL[0]) break;
    streak++;
  }
  return { thisWeek, streak };
}

const KEY = 'sightline.training.v1';
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
// The training days. With storage blocked: this visit only.
export function createTrainingLog(storage = defaultStorage(), { now = () => new Date() } = {}) {
  let memory = [];
  const read = () => {
    try {
      const v = JSON.parse(storage?.getItem(KEY) || 'null');
      if (Array.isArray(v)) return v;
    } catch { /* blocked or broken */ }
    return memory;
  };
  return {
    get: read,
    add() {
      const today = now();
      const oldest = dayKey(new Date(today.getTime() - KEEP_DAYS * DAY));
      const all = [...new Set([...read(), dayKey(today)])].filter((k) => k >= oldest).sort();
      memory = all;
      try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked: this visit only */ }
      return all;
    },
    summary: () => streakOf(read(), now()),
  };
}
