// "Notify me" interest before payments open
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const user = await L.userFromRequest(event); if (!user) return L.bad('Sign in first', 401);
  const { pack } = L.parse(event); if (!L.PACKS[pack]) return L.bad('Unknown pack');
  await L.admin().from('notify_interest').upsert({ email: user.email, pack }, { onConflict: 'email,pack' });
  return L.json(200, { ok: true });
};
