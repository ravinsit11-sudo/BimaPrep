// User reports a UPI payment: UTR + screenshot path -> order becomes 'pending' for admin approval
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const user = await L.userFromRequest(event); if (!user) return L.bad('Sign in first', 401);
  const { orderId, utr, proofPath } = L.parse(event);
  const u = String(utr || '').trim();
  if (!/^[A-Za-z0-9-]{6,40}$/.test(u)) return L.bad('Enter the UPI transaction / UTR number (6–40 letters or digits)');
  if (!proofPath || !String(proofPath).startsWith(user.id + '/')) return L.bad('Payment screenshot missing');
  const sb = L.admin();
  const { data: order } = await sb.from('orders').select('*').eq('id', orderId).eq('user_id', user.id).single();
  if (!order) return L.bad('Order not found');
  if (order.status !== 'created') return L.bad('This order is already ' + order.status);
  const { data: dup } = await sb.from('orders').select('id').eq('utr', u).neq('id', order.id).in('status', ['pending', 'paid']);
  if (dup && dup.length) return L.bad('This transaction number has already been submitted');
  const { error } = await sb.from('orders').update({ status: 'pending', utr: u, proof_path: proofPath, submitted_at: new Date().toISOString() }).eq('id', order.id);
  if (error) return L.bad(error.message, 500);
  return L.json(200, { ok: true, reference: L.reference(order.id) });
};
