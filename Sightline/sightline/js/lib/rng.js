// Randomness helpers. Everything is re-rolled each session.

export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const randRange = (min, max) => Math.random() * (max - min) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns a picker that never gives the same item twice in a row.
export function noRepeatPicker(arr) {
  let last;
  return () => {
    if (arr.length < 2) return arr[0];
    let next;
    do { next = pick(arr); } while (next === last);
    last = next;
    return next;
  };
}
