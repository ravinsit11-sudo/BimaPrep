// Razorpay → server notification (payment.captured). Safety net if the browser closed before verify-payment.
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const sig = event.headers['x-razorpay-signature'];
  const expected = L.hmac(L.env('RAZORPAY_WEBHOOK_SECRET'), event.body || '');
  if (!L.safeEqual(expected, sig)) return L.bad('Bad signature', 400);
  const payload = L.parse(event);
  if (payload.event !== 'payment.captured') return L.json(200, { ignored: payload.event });
  const pay = payload.payload?.payment?.entity || {};
  const sb = L.admin();
  const { data: order } = await sb.from('orders').select('*').eq('razorpay_order_id', pay.order_id).single();
  if (!order) return L.json(200, { ignored: 'unknown order' });
  await L.fulfil(sb, order, pay.id, 'payment');
  return L.json(200, { ok: true });
};
