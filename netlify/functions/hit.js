// Anonymous page-view counter: one row per view (page, day, visitor id hash)
const L = require('./_lib');
const crypto = require('crypto');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.json(200, { ok: true });
  const b = L.parse(event);
  const page = String(b.page || 'home').replace(/[^a-z]/g, '').slice(0, 20) || 'home';
  const vid = crypto.createHash('sha256').update(String(b.vid || 'anon') + (process.env.HIT_SALT || 'bimaprep')).digest('hex').slice(0, 24);
  try { const { error } = await L.admin().from('hits').insert({ page, vid }); if (error) return L.json(200, { ok: false, error: error.message }); } catch (e) { return L.json(200, { ok: false, error: String(e.message || e) }); }
  return L.json(200, { ok: true });
};
