// All tests. No libraries: `node tests/run.js` (or `npm test`).
// Vercel runs this before every deploy (see vercel.json); if anything fails,
// the build fails and nothing goes live.
import { report } from './harness.js';
import './routine.js';
import './cone.js';
import './timing.js';
import './leaderboard.js';
import './evidence.js';
import './readiness.js';
import './vision.js';
import './decisions.js';
import './partner.js';
import './training.js';
import './design.js';
import './sides.js';
import './foolproof.js';
import './eyecheck.js';
import './brand.js';
import './waiver.js';
import './deadcode.js';

process.exit((await report()) ? 1 : 0);
