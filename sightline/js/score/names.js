// Leaderboard names: the name is the identity (no accounts). Pure module,
// shared by the app and the server.
//   "Jordan", "JORDAN" and " jordan " are the same player (case and spacing).
//   Names: up to 12 letters, numbers, spaces and . ' -   Initials: exactly 3 letters.
//   Offensive names are blocked, including common letter/number swaps.

export const NAME_MAX = 12;

// Tidy what was typed: single spaces, no edge spaces, allowed characters only.
export function cleanName(raw, style = 'name') {
  let s = String(raw ?? '').normalize('NFKC');
  if (style === 'initials') return s.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  s = s.replace(/[^\p{L}\p{N} .'’-]/gu, '').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  return s.slice(0, NAME_MAX).trim();
}

// The matching key: same letters regardless of case or spacing.
export const nameKey = (name) => cleanName(name).toLowerCase().replace(/\s+/g, ' ');

// Blocked words. Matched after undoing common swaps (0→o, 1→i, 3→e, 4→a,
// 5→s, 7→t, @→a, $→s) and ignoring case, spaces and punctuation. Three
// strengths, so real names (Yamashita, Hancock, Fagan, Sexton) get through:
//   ANYWHERE   blocked inside any name
//   WORD_START blocked when a word starts with it
//   WHOLE      blocked only as a whole word or the whole name
const ANYWHERE = [
  'fuck', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'retard', 'pussy', 'bastard', 'asshole', 'dildo', 'porn',
  'rapist', 'nazi', 'hitler', 'kkk', 'wank', 'twat', 'tranny', 'jizz', 'molest', 'bitch', 'vagina', 'penis',
];
const WORD_START = ['shit', 'dick', 'cock', 'cum', 'tits', 'boob', 'sex', 'anal', 'pedo', 'spic', 'chink', 'dyke', 'kike'];
const WHOLE = ['ass', 'fag', 'hoe', 'tit', 'kys', 'wtf', 'stfu', 'gtfo', 'nig', 'jap', 'coon'];
// Real names that start with a blocked word.
const ALLOW = ['dickson', 'dickinson', 'dickens', 'dickey', 'dickerson', 'cockburn', 'cockrell', 'cumming', 'cummings',
  'cumberland', 'sexton', 'analise', 'annalise', 'spicer', 'vandyke'];

const SWAPS = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };
const plain = (s) => String(s).toLowerCase().replace(/[0134578@$!|]/g, (c) => SWAPS[c] ?? c);

export function isBlocked(name) {
  const words = plain(name).split(/[^a-z]+/).filter(Boolean).filter((w) => !ALLOW.includes(w));
  const joined = words.join('');
  if (!joined || ALLOW.includes(plain(name).replace(/[^a-z]/g, ''))) return false;
  if (ANYWHERE.some((w) => joined.includes(w))) return true;
  if (words.some((w) => WORD_START.some((b) => w.startsWith(b))) || WORD_START.some((b) => joined.startsWith(b))) return true;
  return words.some((w) => WHOLE.includes(w)) || WHOLE.includes(joined);
}

// Why a name can't be used, or '' if it's fine.
export function nameProblem(raw, style = 'name') {
  const name = cleanName(raw, style);
  if (style === 'initials' && name.length !== 3) return 'Use 3 letters.';
  if (!name) return 'Type a name.';
  if (!/\p{L}/u.test(name)) return 'Use at least one letter.';
  if (isBlocked(name)) return 'Pick a different name.';
  return '';
}

// Names on the board that look like what's being typed: same start, or one or
// two letters off ("Jordn" → "Jordan"). Best matches first.
export function similarNames(typed, names, limit = 4) {
  const t = nameKey(typed);
  if (!t) return [];
  const scored = [];
  for (const n of names) {
    const k = nameKey(n);
    if (k === t) continue;
    const d = k.startsWith(t) ? 0 : distance(t, k.slice(0, Math.max(t.length, k.length)));
    if (k.startsWith(t) || d <= (t.length >= 5 ? 2 : 1)) scored.push([d, n]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).slice(0, limit).map(([, n]) => n);
}

// Edit distance (insert, delete, replace).
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}
