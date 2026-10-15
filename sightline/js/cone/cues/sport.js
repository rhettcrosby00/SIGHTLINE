// SPORT: calls that sound like the athlete's sport, each one mapped to a
// direction (cones sit in those directions, like Arrows). The sport is the one
// picked once on this phone (Settings → You). Calls are short so they read
// from a distance; tennis and baseball assume a right-hander (lefties set the
// side cones the other way).

export const SPORT_PACKS = {
  general:    { F: 'GO',     B: 'BACK', L: 'LEFT',   R: 'RIGHT' },
  basketball: { F: 'DRIVE',  B: 'BACK', L: 'PASS',   R: 'SHOOT' },
  soccer:     { F: 'PRESS',  B: 'DROP', L: 'SWITCH', R: 'CHECK' },
  football:   { F: 'RUN',    B: 'PASS', L: 'STRONG', R: 'WEAK' },
  volleyball: { F: 'TIP',    B: 'DEEP', L: 'LINE',   R: 'CROSS' },
  baseball:   { F: 'IN',     B: 'BACK', L: 'GLOVE',  R: 'ARM' },
  lacrosse:   { F: 'DODGE',  B: 'BACK', L: 'SLIDE',  R: 'CUT' },
  hockey:     { F: 'ATTACK', B: 'BACK', L: 'WALL',   R: 'SLOT' },
  tennis:     { F: 'NET',    B: 'LOB',  L: 'BH',     R: 'FH' },
};
export const SPORT_DIRS = ['F', 'L', 'R', 'B'];
export const RIGHT_HANDED = ['baseball', 'tennis'];

export const packFor = (sport) => SPORT_PACKS[sport] ?? SPORT_PACKS.general;

export const sportCue = {
  id: 'sport',
  label: 'Sport',
  targets: (s) => SPORT_DIRS.map((dir) => ({ key: dir, dir, call: packFor(s.sport)[dir] })),
  face: (target) => ({ kind: 'word', word: target.call, dir: target.dir }),
  speak: (face) => face.word.toLowerCase(),
};
