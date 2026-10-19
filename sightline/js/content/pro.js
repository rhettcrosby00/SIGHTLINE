// Every word of the unlock screen, the price and the store link, in one place.
// Price: Gumroad lists $35.50 so $30 reaches us after its fees (10% + 50¢,
// plus about 2.9% + 30¢ card processing); sales tax is added at checkout.

export const PRO = {
  heading: 'Unlock Sightrep',
  lead: 'One payment unlocks every drill on this phone.',
  includes: [
    'FOCUS: breathing, eye and brain drills',
    'MOVE: react-and-cut agility drills',
    'Training mode, visual skills and Eye Check (beta)',
    'The team leaderboard',
  ],
  price: '$35.50',
  priceNote: '($30 + $5.50 payment fees), plus sales tax where it applies. One time, for this phone.',
  buy: 'Buy on Gumroad',
  buyUrl: 'https://crosby91.gumroad.com/l/sightrep',   // the Gumroad product page
  soon: 'The store opens soon.',
  keyLabel: 'Already bought? Enter your key',
  keyPlaceholder: 'Paste your key',
  unlock: 'Unlock',
  checking: 'Checking your key…',
  unlocked: 'Unlocked. Welcome to Sightrep.',
  movedHere: 'Unlocked. Your key moved to this phone, so your other phone is now locked.',
  movedFree: 'Unlocked. Your key moved into the home-screen app, free.',
  restoring: 'Unlocked. Bringing back your settings…',
  paste: 'Paste',
  // The home-screen app the first time it opens (on iPhone it has its own storage, apart from Safari).
  app: {
    heading: 'Welcome to the Sightrep app',
    keyLabel: 'Your key',
    help: 'Your key is in your Gumroad receipt email (or tap “Copy your key” in Safari first). Moving it from Safari into this app is free: it doesn’t count toward your 3 moves.',
  },
  help: 'Your key is in your Gumroad receipt email. New phone? Enter your key there, and it moves from your old phone. Questions: support@sightrep.app',
  previewHint: 'Preview only: try the test key TEST-OK-1234.',
  errors: {
    empty: 'Paste your key first.',
    invalid: 'That key isn’t right. Check your Gumroad receipt email.',
    refunded: 'This purchase was refunded, so the key no longer works.',
    moves: 'This key has moved to a new phone 3 times in 30 days. Email support@sightrep.app to move it again.',
    busy: 'Too many tries. Wait a few minutes.',
    offline: 'No connection. Connect to the internet to unlock.',
    store: 'The store didn’t answer. Try again in a minute.',
    'link-expired': 'This link has expired. We’ll email you a new one.',
    'code-wrong': 'That code isn’t right. Check it and try again.',
    'code-expired': 'That code has expired. Tap Email me a code for a new one.',
  },
  locked: {
    moved: 'Your key is now on another phone, so this one is locked. Enter your key to move it back.',
    installed: 'Sightrep is on your home screen now: open it from there. To use it here in the browser instead, enter your key and it moves back.',
    refunded: 'This purchase was refunded, so Sightrep is locked on this phone.',
    invalid: 'Your key no longer works. Enter your key again, or a new one.',
    expired: 'Connect to the internet once to keep using Sightrep. It checks your key at least once every 30 days.',
  },
  settings: {
    title: 'Sightrep license',
    on: 'Unlocked on this phone',
    key: (last4) => `Key ending ${last4}`,
    move: 'New phone? Enter your key there. It moves, and this phone locks.',
  },
};
