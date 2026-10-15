// All tests. No libraries: `node tests/run.js` (or `npm test`).
// Vercel runs this before every deploy (see vercel.json); if anything fails,
// the build fails and nothing goes live.
import { report } from './harness.js';
import './routine.js';
import './cone.js';

process.exit(report() ? 1 : 0);
