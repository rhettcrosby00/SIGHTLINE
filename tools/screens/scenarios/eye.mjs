// Eye Check (beta) in a real browser, with Chrome's fake camera (a test
// pattern: no face). "real" shots load the actual face tracker; "sim" shots use
// ?eyesim (a pretend face, js/eye/sim.js) so calibration, drill feedback and
// the summary can be seen. Every shot spies on the camera and the network:
//   CAMERA_OFF  every camera stream the app opened has ended
//   PRIVATE     only GETs to Sightrep itself, plus the score upload (with no eye data in it) and
//               the setup saved with the key (only its known items, no eye data)
// Same shot format as main.mjs.
import { BASE as MAIN } from './main.mjs';
import { BACKUP_KEYS } from '../../../sightline/js/backup.js';

export const BASE = { ...MAIN, eyeCheck: 'on' };

const SPY = ['eval', `(() => {
  window.__streams = [];
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__streams.push(s); return s; };
  window.__net = [];
  const f = window.fetch;
  window.fetch = (u, o = {}) => { window.__net.push([o.method || (u instanceof Request ? u.method : 'GET'), String(u instanceof Request ? u.url : u), String(o.body ?? '')]); return f(u, o); };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { window.__net.push([m, String(u)]); return open.apply(this, arguments); };
})()`];
const DENY = ['eval', "navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))"];
const OPEN = [SPY, ['click', '#btn-focus'], ['click', '.adv__head'], ['click', '[data-run="activate"]'], ['waitFor', '[data-eye="on"]', 20000]];
const CAMERA_ON = [...OPEN, ['click', '[data-eye="on"]']];
const CALIBRATED = [...CAMERA_ON, ['waitFor', '[data-eye="go"]', 40000], ['click', '[data-eye="go"]']];
const CAMERA_OFF = 'js:window.__streams.length > 0 && window.__streams.every((s) => s.getTracks().every((t) => t.readyState === "ended"))';
// Nothing about the camera leaves the phone: only reads from this site, scores to the leaderboard,
// and the setup saved with the key (js/backup.js: only its known items, such as the Eye Check on/off
// setting; never gaze, video or pictures).
const PRIVATE = 'js:window.__net.every(([m, u, b]) => new URL(u, location.href).origin === location.origin && (m === "GET"'
  + ' || (m === "POST" && /\\/api\\/leaderboard/.test(u) && !/gaze|eye|recording|camera/i.test(b))'
  + ` || (m === "POST" && /\\/api\\/license/.test(u) && Object.keys(JSON.parse(b).data ?? {}).every((k) => ${JSON.stringify(BACKUP_KEYS)}.includes(k)) && !/gaze|recording|camera|landmark|video|data:image/i.test(b))))`;
const ONLY = (ids) => `autoready=1&only=${ids}`;

export const SHOTS = [
  // The question, then the real face tracker on a camera with no face: tips, Skip, and the drill runs normally.
  { name: 'eye-ask', params: ONLY('pursuit'), steps: [...OPEN, ['wait', 300]], expect: ['Use the front camera?', 'Video never leaves your phone', 'Not now'] },
  { name: 'eye-real-tips', params: ONLY('pursuit'), steps: [...CAMERA_ON, ['waitFor', '.eyecal__checks', 40000], ['wait', 2500]],
    expect: ['Keep your face in view', 'js:window.__streams.length === 1 && window.__streams[0].getTracks()[0].readyState === "live"', PRIVATE,
      'js:["GPU", "CPU"].includes(document.getElementById("eye-status").dataset.engine)'] },
  { name: 'eye-real-skip', params: ONLY('pursuit'), steps: [...CAMERA_ON, ['waitFor', '.eyecal__checks', 40000], ['click', '[data-eye="skip"]'], ['waitFor', '.eyes__dot', 15000], ['wait', 800]],
    expect: ['.eyes__dot', CAMERA_OFF, '#eye-status[hidden]', PRIVATE], combos: 'few' },
  // Camera refused: a note, and the drill runs normally to the end.
  { name: 'eye-denied', params: ONLY('pursuit'), steps: [SPY, DENY, ['click', '#btn-focus'], ['click', '.adv__head'], ['click', '[data-run="activate"]'], ['waitFor', '[data-eye="on"]', 20000], ['click', '[data-eye="on"]'], ['wait', 600]],
    expect: ['Camera is off. The drill runs normally.'], combos: 'few' },
  { name: 'eye-denied-done', player: 'Jordan', params: `speed=40&${ONLY('pursuit')}`, steps: [SPY, DENY, ['click', '#btn-focus'], ['click', '.adv__head'], ['click', '[data-run="activate"]'], ['waitFor', '[data-eye="on"]', 20000], ['click', '[data-eye="on"]'], ['waitFor', '#screen-done.is-active', 60000]],
    expect: ['#screen-done.is-active', 'js:!document.querySelector(".eyesum")'], combos: 'few' },
  // Pretend face: calibration dots, then "See your gaze".
  { name: 'eye-dots', params: `eyesim=1&${ONLY('quieteye')}`, steps: [...CAMERA_ON, ['waitFor', '.eyecal.is-dots', 20000], ['wait', 2600]], expect: ['Look at the dot until it fills'] },
  { name: 'eye-see', params: `eyesim=1&${ONLY('quieteye')}`, steps: [...CAMERA_ON, ['waitFor', '[data-eye="go"]', 40000], ['wait', 800]], expect: ['See your gaze', 'Accuracy (estimated)', 'Looks off? Recalibrate', '.eyecal__glow:not([hidden])'] },
  // Drill feedback (no live cursor anywhere).
  { name: 'eye-qe', params: `eyesim=1&${ONLY('quieteye')}`, steps: [...CALIBRATED, ['waitFor', '.qe.is-eyes-on', 20000], ['wait', 900]], expect: ['Camera on', '#eye-status:not([hidden])', 'js:!document.querySelector(".eyecal__glow")'] },
  { name: 'eye-periph-away', params: `eyesim=away&${ONLY('peripheral')}`, steps: [...CALIBRATED, ['waitFor', '.rx[data-eyes="away"]', 30000], ['wait', 600]], expect: ['.rx__edge[data-side="right"]'] },
  // (the dot dims, then brightens again as it passes where the pretend eyes look: waitFor is the check)
  { name: 'eye-pursuit-behind', params: `eyesim=away&${ONLY('pursuit')}`, steps: [...CALIBRATED, ['waitFor', '.eyes__dot.is-behind', 20000]], combos: 'few' },
  { name: 'eye-saccade-check', params: `eyesim=1&${ONLY('saccades')}`, steps: [...CALIBRATED, ['waitFor', '.eyes__check.is-on', 30000], ['wait', 150]], expect: ['.eyes__check.is-on'], combos: 'few' },
  // Low confidence and a lost camera: eye features pause or stop; the drill goes on.
  { name: 'eye-low', params: `eyesim=low&${ONLY('pursuit')}`, steps: [...CALIBRATED, ['until', "document.getElementById('eye-note').textContent.includes('Eye tracking paused')", 15000], ['wait', 200]], expect: ['Eye tracking paused', '.eyes__dot'], combos: 'few' },
  { name: 'eye-lost', params: `eyesim=1&${ONLY('pursuit')}`, steps: [...CALIBRATED, ['wait', 1500], ['eval', "window.__streams.at(-1).getTracks()[0].dispatchEvent(new Event('ended'))"], ['wait', 500]],
    expect: ['Camera stopped. The drill keeps going.', '.eyes__dot', CAMERA_OFF], combos: 'few' },
  // Recalibrate from Pause.
  { name: 'eye-pause', params: `eyesim=1&${ONLY('quieteye')}`, steps: [...CALIBRATED, ['wait', 800], ['click', '#btn-pause'], ['wait', 300]], expect: ['#btn-eye-recal:not([hidden])', 'Recalibrate Eye Check'], combos: 'few' },
  // The summary: stats, tip, replay and heat map; the camera is off and nothing was sent.
  { name: 'eye-summary', player: 'Jordan', params: `eyesim=1&speed=20&${ONLY('pursuit,saccades,peripheral,quieteye')}`,
    steps: [...CALIBRATED, ['waitFor', '#screen-done.is-active', 110000], ['scrollTo', '.eyesum__drill'], ['wait', 400]],
    expect: ['Eye Check (beta) · estimated', 'Eyes centered', 'On track', 'Quiet Eye:', 'Moved toward the target', 'Not a vision or medical test', CAMERA_OFF, PRIVATE] },
  // Real time (Quiet Eye's steadiness is judged on the drill clock, so no fast-forward here).
  { name: 'eye-summary-qe', player: 'Jordan', params: `eyesim=1&${ONLY('quieteye')}`,
    steps: [...CALIBRATED, ['waitFor', '#screen-done.is-active', 110000], ['scrollTo', '.eyesum__drill'], ['wait', 400]],
    expect: ['js:/Locked on [1-9]/.test(document.body.innerText)', 'js:!/Quiet Eye: 0\\.0 s/.test(document.body.innerText)', CAMERA_OFF], combos: 'few' },
  { name: 'eye-summary-play', player: 'Jordan', params: `eyesim=1&speed=20&${ONLY('pursuit,peripheral')}`,
    steps: [...CALIBRATED, ['waitFor', '#screen-done.is-active', 110000], ['scrollTo', '.eyesum__drill'], ['click', '[data-slow]'], ['click', '[data-play]'], ['wait', 900]],
    expect: ['Pause', '[data-slow][aria-pressed="true"]'], combos: 'few' },
];
