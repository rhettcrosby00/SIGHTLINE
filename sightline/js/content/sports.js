// Sports and positions (asked once, remembered on this phone), plus
// instructional cue words for each sport: skill-focus words like "Eyes up",
// next to the motivational ones ("Attack", "Compete") in js/content/cues.js.

export const SPORTS = [
  { id: 'general', label: 'General / other', positions: [] },
  { id: 'basketball', label: 'Basketball', positions: [['guard', 'Guard'], ['wing', 'Wing'], ['post', 'Post']] },
  { id: 'soccer', label: 'Soccer', positions: [['forward', 'Forward'], ['midfield', 'Midfield'], ['defense', 'Defense'], ['keeper', 'Goalkeeper']] },
  { id: 'football', label: 'Football', positions: [['qb', 'Quarterback'], ['skill', 'Receiver / back'], ['line', 'Lineman'], ['defense', 'Defense']] },
  { id: 'volleyball', label: 'Volleyball', positions: [['setter', 'Setter'], ['hitter', 'Hitter'], ['middle', 'Middle'], ['libero', 'Libero / DS']] },
  { id: 'baseball', label: 'Baseball / softball', positions: [['pitcher', 'Pitcher'], ['catcher', 'Catcher'], ['infield', 'Infield'], ['outfield', 'Outfield']] },
  { id: 'lacrosse', label: 'Lacrosse', positions: [['attack', 'Attack'], ['midfield', 'Midfield'], ['defense', 'Defense'], ['goalie', 'Goalie']] },
  { id: 'hockey', label: 'Hockey', positions: [['forward', 'Forward'], ['defense', 'Defense'], ['goalie', 'Goalie']] },
  { id: 'tennis', label: 'Tennis', positions: [['singles', 'Singles'], ['doubles', 'Doubles']] },
];
export const sportById = Object.fromEntries(SPORTS.map((s) => [s.id, s]));

// Instructional cue words: what to do, not how to feel. 14 characters max.
export const SKILL_WORDS = {
  general: ['EYES UP', 'STAY LOW', 'QUICK FEET', 'SEE IT EARLY', 'SOFT HANDS', 'BREATHE OUT'],
  basketball: ['EYES UP', 'LOW AND QUICK', 'HANDS READY', 'FOLLOW THROUGH', 'SEE THE RIM', 'BOX OUT'],
  soccer: ['SCAN', 'FIRST TOUCH', 'OPEN BODY', 'HEAD UP', 'STRIKE THROUGH', 'PRESS'],
  football: ['GET OFF', 'LOW PAD LEVEL', 'EYES ON KEYS', 'HANDS INSIDE', 'READ IT', 'FINISH'],
  volleyball: ['BALL UP', 'SPLIT STEP', 'EYES ON HITTER', 'REACH HIGH', 'PLATFORM', 'SEE IT EARLY'],
  baseball: ['SEE THE BALL', 'STAY THROUGH', 'QUICK HANDS', 'HIT YOUR SPOT', 'FIRST STEP', 'TRUST HANDS'],
  lacrosse: ['STICK UP', 'SCAN', 'SHOOT LOW', 'QUICK STICK', 'BODY POSITION', 'EYES UP'],
  hockey: ['HEAD UP', 'KNEES BENT', 'QUICK STICK', 'FIRST STRIDE', 'SEE THE PUCK', 'SHOOT QUICK'],
  tennis: ['WATCH THE BALL', 'SPLIT STEP', 'EARLY PREP', 'LOOSE ARM', 'FINISH HIGH', 'MOVE YOUR FEET'],
};

// A valid sport and position, or the general defaults.
export function cleanSport(sport, position) {
  const s = sportById[sport] ? sport : 'general';
  const p = sportById[s].positions.some(([id]) => id === position) ? position : '';
  return { sport: s, position: p };
}
