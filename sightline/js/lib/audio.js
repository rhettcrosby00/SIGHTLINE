// Gentle sound + vibration cues. Call unlock() from the Start tap (iOS needs a
// gesture), so cues are never silent because sound wasn't allowed yet.
//   Sound on: tones (and spoken numbers / callouts) play even with the
//   iPhone's silent switch on, where the phone supports it (Audio Session API).
//   That pauses other music while a session runs.
//   Sound off: no tones or voice; vibration still works.
//   Music mode ("Keep my music playing"): the app never starts audio at all, so
//   the athlete's own music keeps playing; cues come as vibration and visuals.
// Vibration needs a phone that supports it (Android). iPhone doesn't let web
// apps vibrate, so every buzz comes with a tone or a change on screen.
// onInterrupt(fn): a call or alarm took the sound away mid-session (iPhone).

let ctx = null;
let enabled = false;
let voiceOn = false;
let musicMode = false;
const interrupts = new Set();

export function onInterrupt(fn) { interrupts.add(fn); return () => interrupts.delete(fn); }
// After a pause: take the sound back (call from a tap).
export function resumeAudio() { if (enabled && ctx && ctx.state !== 'running') ctx.resume().catch?.(() => {}); }

// Play through the silent switch when the app makes sound; mix politely when it doesn't.
function audioSession(type) {
  try { if (globalThis.navigator?.audioSession) navigator.audioSession.type = type; } catch { /* not supported */ }
}

export function setMusicMode(on) { musicMode = !!on; }
export const isMusicMode = () => musicMode;
export const soundEnabled = () => enabled;   // tones and voice will play (Sound on, not music mode)
const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

// `voice`: also allow spoken callouts (speech synthesis), primed inside the tap.
export function unlock(soundOn, { voice = false } = {}) {
  enabled = soundOn && !musicMode;
  audioSession(enabled ? 'playback' : 'ambient');
  voiceOn = enabled && voice && 'speechSynthesis' in globalThis;
  if (voiceOn) {
    try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch { voiceOn = false; }
  }
  if (!enabled) return;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Safari: 'interrupted' while a call or alarm has the sound.
      ctx.addEventListener?.('statechange', () => { if (ctx.state === 'interrupted') interrupts.forEach((fn) => fn()); });
    }
    if (ctx.state !== 'running') ctx.resume();
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

// Spoken callout ("Red!", "Left!"). Cuts off the previous one so it never lags.
export function say(text) {
  if (!voiceOn) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.2;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

export function buzz(pattern = 30) {
  // Browsers block vibration until the page has had a real tap.
  if (!canVibrate() || navigator.userActivation?.hasBeenActive === false) return;
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

// Named cues used across the app.
export const cues = {
  // Drills
  tick:    () => tone(587, { dur: 0.09, gain: 0.1 }),
  go:      () => tone(880, { dur: 0.16, gain: 0.14 }),
  correct: () => tone(988, { dur: 0.07, gain: 0.07 }),
  wrong:   () => { tone(196, { dur: 0.16, gain: 0.12 }); buzz(60); },
  block:   () => { tone(440, { dur: 0.12, gain: 0.1 }); setTimeout(() => tone(660, { dur: 0.18, gain: 0.1 }), 110); },
  // Breathing: each switch has its own vibration, so eyes can stay closed.
  //   in = one long pulse · hold = one tap · out = two pulses
  inhale: () => { tone(330, { toFreq: 494, dur: 0.6 }); buzz(70); },
  exhale: () => { tone(494, { toFreq: 294, dur: 0.6 }); buzz([35, 90, 35]); },
  hold:   () => { tone(392, { dur: 0.25, gain: 0.1 }); buzz(15); },
  power:  () => { tone(523, { toFreq: 659, dur: 0.18, gain: 0.14 }); buzz(25); },
  done:   () => { tone(523, { dur: 0.2 }); setTimeout(() => tone(784, { dur: 0.4 }), 180); buzz([40, 80, 80]); },
};
