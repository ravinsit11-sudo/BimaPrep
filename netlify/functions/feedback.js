// Public feedback / query form -> feedback table (approved=false until admin approves)
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const b = L.parse(event);
  const name = String(b.name || '').trim().slice(0, 60), email = String(b.email || '').trim().slice(0, 120);
  const message = String(b.message || '').trim().slice(0, 1000), org = String(b.org || '').trim().slice(0, 80);
  const kind = ['feedback', 'query', 'correction'].includes(b.kind) ? b.kind : 'feedback';
  if (name.length < 2) return L.bad('Enter your name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return L.bad('Enter a valid email');
  if (message.length < 10) return L.bad('Message is too short');
  const sb = L.admin();
  // simple abuse guard: max 5 messages per email per day
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await sb.from('feedback').select('*', { count: 'exact', head: true }).eq('email', email).gte('created_at', since);
  if ((count || 0) >= 5) return L.bad('Too many messages today; please email support@bimaprep.in');
  const user = await L.userFromRequest(event);
  const { error } = await sb.from('feedback').insert({ name, email, kind, org: org || null, message, user_id: user ? user.id : null });
  if (error) return L.bad(error.message, 500);
  return L.json(200, { ok: true });
};
