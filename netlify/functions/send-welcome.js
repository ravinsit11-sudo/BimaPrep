// Sends the branded welcome mail once per user, via Brevo SMTP (needs BREVO_SMTP_USER, BREVO_SMTP_KEY, MAIL_FROM).
// Called by the page after the first sign-in. Silently does nothing if SMTP is not configured.
const L = require('./_lib');
const fs = require('fs'); const path = require('path');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) {}
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const user = await L.userFromRequest(event); if (!user) return L.bad('Sign in first', 401);
  const sb = L.admin();
  const { data: p } = await sb.from('profiles').select('welcome_sent_at,name,email').eq('id', user.id).single();
  if (!p || p.welcome_sent_at) return L.json(200, { ok: true, skipped: 'already sent' });
  if (!nodemailer || !process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) return L.json(200, { ok: true, skipped: 'smtp not configured' });
  let html = '';
  try { html = fs.readFileSync(path.join(__dirname, 'welcome.html'), 'utf8'); } catch (e) { return L.json(200, { ok: true, skipped: 'template missing' }); }
  html = html.replace(/{{NAME}}/g, (p.name || 'there').split(' ')[0]).replace(/{{EMAIL}}/g, p.email);
  const t = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, secure: false, auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_KEY } });
  try {
    await t.sendMail({ from: `BimaPrep <${process.env.MAIL_FROM || 'support@bimaprep.in'}>`, to: p.email, subject: 'Welcome to BimaPrep — your account details', html });
    await sb.from('profiles').update({ welcome_sent_at: new Date().toISOString() }).eq('id', user.id);
    return L.json(200, { ok: true });
  } catch (e) { return L.json(200, { ok: false, error: e.message }); }
};
