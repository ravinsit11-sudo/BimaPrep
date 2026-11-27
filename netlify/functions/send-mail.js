// Admin broadcast / direct mail from BimaPrep <support@bimaprep.in> via Brevo SMTP.
// body: { to: 'me'|'list'|'all'|'buyers'|'pending', list:[emails], subject, text }
const L = require('./_lib');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) {}
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function html(text) {
  const paras = String(text).trim().split(/\n\s*\n/).map(p => '<p style="margin:0 0 14px">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
  return `<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#1b2a41">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0f2b46;padding:18px 24px;color:#fff;font-family:Georgia,serif;font-size:24px;font-weight:bold">Bima<span style="color:#ff9f43">Prep</span> <span style="font-family:Arial;font-size:11px;letter-spacing:2px;opacity:.8;margin-left:8px">INSURANCE EXAM PREPARATION · INDIA</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${paras}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e3e9ef;font-size:12px;color:#4b5a6b">BimaPrep · <a href="https://bimaprep.in" style="color:#0d6b8a">bimaprep.in</a> · support@bimaprep.in<br>You are receiving this because you have an account on BimaPrep or asked to hear from us. Reply to this mail to unsubscribe.</td></tr>
</table></td></tr></table></body></html>`;
}
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const me = await L.userFromRequest(event); if (!me) return L.bad('Sign in first', 401);
  if (!me.is_admin) return L.bad('Admin only', 403);
  if (!nodemailer || !process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) return L.bad('Mail is not configured: set BREVO_SMTP_USER, BREVO_SMTP_KEY and MAIL_FROM in Netlify.');
  const b = L.parse(event);
  const subject = String(b.subject || '').trim().slice(0, 200), text = String(b.text || '').trim().slice(0, 20000);
  if (!subject || !text) return L.bad('Subject and message are required');
  const sb = L.admin(); let rcpts = [];
  if (b.to === 'me') rcpts = [me.email];
  else if (b.to === 'list') rcpts = (b.list || []).map(x => String(x).trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  else if (b.to === 'all') { const { data } = await sb.from('profiles').select('email').limit(5000); rcpts = (data || []).map(x => x.email); }
  else if (b.to === 'buyers') { const { data } = await sb.from('active_entitlements').select('user_id').limit(5000); const ids = [...new Set((data || []).map(x => x.user_id))]; if (ids.length) { const { data: p } = await sb.from('profiles').select('email').in('id', ids); rcpts = (p || []).map(x => x.email); } }
  else if (b.to === 'pending') { const { data } = await sb.from('orders').select('user_id').eq('status', 'pending').limit(5000); const ids = [...new Set((data || []).map(x => x.user_id))]; if (ids.length) { const { data: p } = await sb.from('profiles').select('email').in('id', ids); rcpts = (p || []).map(x => x.email); } }
  rcpts = [...new Set(rcpts.filter(Boolean))].slice(0, 250);   // Brevo free tier: 300/day
  if (!rcpts.length) return L.json(200, { sent: 0, failed: 0, note: 'no recipients' });
  const t = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, secure: false, auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_KEY } });
  const from = `BimaPrep <${process.env.MAIL_FROM || 'support@bimaprep.in'}>`, body = html(text);
  let sent = 0, failed = 0, firstError = null;
  try { await t.verify(); } catch (e) { return L.bad('SMTP login failed: ' + (e.response || e.message) + ' — check BREVO_SMTP_USER / BREVO_SMTP_KEY in Netlify.'); }
  for (const to of rcpts) {
    try { await t.sendMail({ from, to, replyTo: from, subject, text, html: body }); sent++; }
    catch (e) { failed++; if (!firstError) firstError = (e.response || e.message || String(e)).slice(0, 300); }
  }
  try { await sb.from('audit_log').insert({ actor: me.id, action: 'send-mail', detail: { to: b.to, count: sent, subject } }); } catch (e) {}
  return L.json(200, { sent, failed, error: firstError || undefined, note: rcpts.length === 250 ? 'capped at 250 per send' : undefined });
};
