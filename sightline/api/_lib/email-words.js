// Every word of the emails Sightrep sends (6.6, api/_lib/purchases.js; server only): the "Start Sightrep"
// email after a purchase, and the 6-digit sign-in code. Plain text plus simple HTML (inline
// styles: email apps ignore style sheets). Sent from start@sightrep.app; replies go to support.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#0A0B08', LIME = '#B7FF00', PAPER = '#F5F6F0', MUTED = '#565B4C';   // the palette (css/palette.css; email apps can't load it)

const page = (inner) => `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER};">
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${INK};">
<p style="margin:0 0 24px;font:800 20px/1 Arial,sans-serif;letter-spacing:0.04em;">SIGHT<span style="background:${INK};color:${LIME};padding:0 3px;">REP</span></p>
${inner}
<p style="margin:32px 0 0;color:${MUTED};font-size:13px;">Questions? Reply to this email or write to support@sightrep.app.<br>Sightrep is a training and warm-up tool. It is not medical advice.</p>
</div></body></html>`;

// After a purchase: one big button that opens Sightrep, unlocked.
export function startEmail({ link, help = 'https://sightrep.app/install' }) {
  return {
    subject: 'Start Sightrep',
    text: `Thanks for buying Sightrep!

Tap this link on your phone to start. It opens Sightrep, already unlocked:
${link}

Then put it on your home screen:
- iPhone (Safari): tap Share, then "Add to Home Screen," then "Add." Open the new icon and get a 6-digit code at this email to sign in there (one time).
- Android (Chrome): tap "Install Sightrep."
Help: ${help}

The link works once, for 7 days. If it has expired, open it anyway and tap "Email me a new link."`,
    html: page(`
<h1 style="margin:0 0 12px;font:800 28px/1.1 Arial,sans-serif;text-transform:uppercase;">Your eyes move first.</h1>
<p style="margin:0 0 24px;">Thanks for buying Sightrep! Tap the button on your phone. Sightrep opens, already unlocked. No key to type.</p>
<p style="margin:0 0 28px;"><a href="${esc(link)}" style="display:inline-block;padding:16px 32px;border-radius:14px;background:${LIME};color:${INK};font:800 20px/1 Arial,sans-serif;text-decoration:none;text-transform:uppercase;">Start Sightrep</a></p>
<p style="margin:0 0 8px;font-weight:700;">Then put it on your home screen</p>
<p style="margin:0 0 8px;"><b>iPhone (Safari):</b> tap Share, then “Add to Home Screen,” then “Add.” Open the new icon and get a 6-digit code at this email to sign in there (one time).</p>
<p style="margin:0 0 8px;"><b>Android (Chrome):</b> tap “Install Sightrep.”</p>
<p style="margin:0 0 20px;"><a href="${esc(help)}" style="color:${INK};">Step-by-step help</a></p>
<p style="margin:0;color:${MUTED};font-size:14px;">The button works once, for 7 days. If it has expired, tap it anyway and choose “Email me a new link.”</p>`),
  };
}

// A sign-in code (a new phone, or the home-screen app on iPhone).
export function codeEmail({ code }) {
  return {
    subject: `${code} is your Sightrep code`,
    text: `Your Sightrep sign-in code: ${code}

Type it in Sightrep within 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: page(`
<p style="margin:0 0 12px;">Your Sightrep sign-in code:</p>
<p style="margin:0 0 20px;font:800 40px/1 Arial,sans-serif;letter-spacing:0.12em;">${esc(code)}</p>
<p style="margin:0;color:${MUTED};font-size:14px;">Type it in Sightrep within 10 minutes. If you didn’t ask for it, you can ignore this email.</p>`),
  };
}
