// Dev aid (?eyesim=1): a pretend face, for testing Eye Check without a person
// in front of the camera (the screen checks). The camera still turns on and
// off for real; only the face tracker is replaced. The pretend eyes look where
// an athlete should (the calibration dot, the target, the center dot), with a
// little noise. ?eyesim=low drops the face every other 2.5 s (low confidence);
// ?eyesim=away looks at the right edge during drills (calibration still works).

const noise = () => (Math.random() - 0.5) * 0.02;

function lookingAt() {
  const at = (sel) => {
    const el = document.querySelector(sel);
    if (!el || el.closest('[hidden]')) return null;
    const r = el.getBoundingClientRect();
    return r.width ? [(r.left + r.width / 2) / innerWidth, (r.top + r.height / 2) / innerHeight] : null;
  };
  return at('.eyecal__dot') ?? at('.qe--field') ?? at('.eyes__dot') ?? at('.eyes__target') ?? at('.rx__fix') ?? [0.5, 0.5];
}

export function simulatedEye(mode = '1') {
  return {
    loadLandmarker: async () => ({ close() {} }),
    read(t) {
      if (mode === 'low' && Math.floor(t / 2500) % 2 === 1) return { f: null, brightness: 120 };
      const calibrating = !!document.querySelector('.eyecal:not([hidden])');
      const [x, y] = mode === 'away' && !calibrating ? [0.92, 0.5] : lookingAt();
      return {
        brightness: 120,
        f: {
          hx: (x - 0.5) * 0.3 + noise(), hb: (x - 0.5) * 0.8 + noise(), yaw: 0,
          vy: (y - 0.5) * 0.12 + noise(), vb: (0.5 - y) * 0.8 + noise(), pitch: 0, open: 0.28 - (y - 0.5) * 0.05,
          size: 0.26, blink: 0,
        },
      };
    },
  };
}
