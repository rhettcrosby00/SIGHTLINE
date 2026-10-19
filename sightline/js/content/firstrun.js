// Every word of a buyer's first minute (6.5): the buyer's unlock screen (js/unlock.js), the
// computer-to-phone handoff (js/handoff.js) and the first-time setup (js/onboarding.js), plus
// the setup steps the server counts (totals only, per day: api/_lib/service.js).

export const FIRST = {
  // Opened from "Start Sightrep" on the Gumroad page (?start), or the home-screen app's first open.
  buyer: {
    heading: 'Let’s get you started',
    lead: 'Tap Copy next to your key on your Gumroad page, then tap Paste here.',
    paste: 'Paste your key',
    noKey: 'Your clipboard doesn’t have a key. Tap Copy next to your key on your Gumroad page, then come back and tap Paste your key.',
    blocked: 'Pasting was blocked. Enter your key below instead.',
    enter: 'Have a license key? Enter it here',
    buy: 'Don’t have a key yet?',
    unlocking: 'Unlocking…',
  },
  // The purchase email's "Start Sightrep" link (#t=…), and 6-digit codes (6.6).
  link: {
    unlocking: 'Opening Sightrep…',
    expired: 'This link has expired. We’ll email you a new one.',
    resend: 'Email me a new link',
    sent: 'Sent. Check your email for a new Start Sightrep link.',
    qr: 'Scan with your phone’s camera to open your Start Sightrep link there. It works once.',
  },
  email: {
    get: 'Get a code by email',
    label: 'Your purchase email',
    placeholder: 'The email you bought with',
    send: 'Email me a code',
    sent: 'If that email bought Sightrep, a 6-digit code is on its way. It works for 10 minutes.',
    code: '6-digit code',
    check: 'Unlock',
  },
  app: {
    lead: 'Enter your purchase email to get a 6-digit code. Your settings come back with it.',
    paste: 'Or paste your key',
  },
  // Opened on a computer: hand the unlock to the phone with a QR code.
  desktop: {
    heading: 'Sightrep works best on your phone',
    lead: 'Paste your key here, then scan the code with your phone’s camera. Sightrep opens there, unlocked.',
    qr: 'Scan with your phone’s camera. The code works once, for 10 minutes.',
    here: 'Continue on this computer',
    make: 'Make the QR code',
    again: 'Make a new code',
    expired: 'That code has expired or was already used. Make a new one on your computer, or paste your key here.',
  },
  progress: (n, total) => `Step ${n} of ${total}`,
  back: 'Back',
  ready: {
    title: 'You’re in',
    line: 'You’re all set. Sightrep is unlocked on this phone.',
    lineFor: (email) => `You’re all set, ${email}. Your Sightrep access is active.`,
    next: 'Continue',
  },
  yours: {
    title: 'Make it yours',
    lead: 'Optional. Change any of it later in Settings.',
    sport: 'Your sport',
    position: 'Position (any)',
    name: 'Name on the leaderboard',
    namePlaceholder: 'Optional, up to 12 letters',
    next: 'Continue',
    skip: 'Skip for now',
  },
  install: {
    title: 'Put Sightrep on your home screen',
    done: 'Done',
    later: 'Remind me later',
  },
  finish: {
    title: 'Let’s try it. 3 minutes.',
    lead: 'A breathing warm-up, then Color Call with a practice round first.',
    start: 'Start',
    explore: 'Explore on my own',
  },
  firstDone: 'Next time, pick a Game Day preset (5 to 8 minutes) before practice or a game.',
};

// The setup steps the server counts, each once per phone: how far new buyers get.
export const SETUP_STEPS = {
  opened: 'Opened the Start link',
  unlocked: 'Unlocked a new phone',
  waiver: 'Accepted the waiver',
  ready: 'Saw “You’re in”',
  yours: 'Made it theirs',
  'yours-skip': 'Skipped “Make it yours”',
  install: 'Added to the home screen',
  'install-later': 'Chose “Remind me later”',
  'install-skip': 'Already in the home-screen app',
  start: 'Started the first session',
  explore: 'Chose “Explore on my own”',
  'first-done': 'Finished the first session',
};
