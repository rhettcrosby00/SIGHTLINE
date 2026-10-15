// Cue types, one module each, so new ones can be added later: give it an id,
// a label, targets(setup), face(target, opts) and speak(face), then add it here
// and teach js/cone/render.js how to draw its face kind.
import { colorCue } from './color.js';
import { arrowCue } from './arrow.js';
import { numberCue } from './number.js';
import { mixedCue } from './mixed.js';
import { sportCue } from './sport.js';

export const CUES = { colors: colorCue, arrows: arrowCue, numbers: numberCue, mixed: mixedCue, sport: sportCue };
