// License keys on the server: one spelling (js/license.js cleanKey), and a
// one-way hash, so the database never holds a key itself.
import { createHash } from 'node:crypto';
import { cleanKey } from '../../js/license.js';

export const keyHash = (key) => createHash('sha256').update(`sightrep-key:${cleanKey(key)}`).digest('hex');
// A computer-to-phone handoff's id, hashed the same way (js/handoff.js).
export const handoffHash = (id) => createHash('sha256').update(`sightrep-handoff:${id}`).digest('hex');
