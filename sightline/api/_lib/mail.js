// Sending email (6.6): through Resend's HTTP API with RESEND_API_KEY (a Cloudflare secret),
// from start@sightrep.app, replies to support@sightrep.app. Without a key (tests and local
// runs) nothing is sent: messages go to OUTBOX, which the local test API can show (TEST_MAIL=1).

import { HttpError } from './service.js';

export const FROM = 'Sightrep <start@sightrep.app>';
export const REPLY_TO = 'support@sightrep.app';
export const OUTBOX = [];   // local and tests only: { to, subject, text, html, at }

export function createMailer({ apiKey = '', fetch: fetchFn = (...a) => globalThis.fetch(...a), now = () => Date.now() } = {}) {
  return {
    live: !!apiKey,
    async send({ to, subject, text, html }) {
      if (!apiKey) {
        OUTBOX.push({ to, subject, text, html, at: now() });
        if (OUTBOX.length > 200) OUTBOX.shift();
        return { ok: true };
      }
      let res;
      try {
        res = await fetchFn('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text, html }),
        });
      } catch {
        throw new HttpError(503, 'The email didn’t send. Try again in a minute.');
      }
      if (!res.ok) throw new HttpError(503, 'The email didn’t send. Try again in a minute.');
      return { ok: true };
    },
  };
}
