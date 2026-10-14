// Gentle sound + vibration cues. Everything is a no-op when Sound is off or
// the browser lacks support. Call unlock() from a tap (iOS needs a gesture).

let ctx = null;
let enabled = false;

export function unlock(soundOn) {
  enabled = soundOn;
  if (!enabled) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

// One soft sine tone, optionally gliding from `freq` to `toFreq`.
export function tone(freq, { toFreq = freq, dur = 0.35, gain = 0.18 } = {}) {
  if (!enabled || !ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch { /* ignore */ }
}

export function buzz(pattern = 30) {
  // Browsers block vibration until the page has had a real tap.
  if (!enabled || navigator.userActivation?.hasBeenActive === false) return;
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// Named cues used across the app.
export const cues = {
  // Drills
  tick:    () => tone(587, { dur: 0.09, gain: 0.1 }),
  go:      () => tone(880, { dur: 0.16, gain: 0.14 }),
  correct: () => tone(988, { dur: 0.07, gain: 0.07 }),
  wrong:   () => { tone(196, { dur: 0.16, gain: 0.12 }); buzz(60); },
  block:   () => { tone(440, { dur: 0.12, gain: 0.1 }); setTimeout(() => tone(660, { dur: 0.18, gain: 0.1 }), 110); },
  // Breathing
  inhale: () => { tone(330, { toFreq: 494, dur: 0.6 }); buzz(40); },
  exhale: () => { tone(494, { toFreq: 294, dur: 0.6 }); buzz([20, 60, 20]); },
  hold:   () => { tone(392, { dur: 0.25, gain: 0.1 }); buzz(15); },
  power:  () => { tone(523, { toFreq: 659, dur: 0.18, gain: 0.14 }); },
  done:   () => { tone(523, { dur: 0.2 }); setTimeout(() => tone(784, { dur: 0.4 }), 180); buzz([40, 80, 80]); },
};
