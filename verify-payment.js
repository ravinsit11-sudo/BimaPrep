// Called by the browser after Razorpay checkout succeeds; verifies the signature and unlocks the pack
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const user = await L.userFromRequest(event); if (!user) return L.bad('Sign in first', 401);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = L.parse(event);
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return L.bad('Missing payment details');
  const expected = L.hmac(L.env('RAZORPAY_KEY_SECRET'), `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!L.safeEqual(expected, razorpay_signature)) return L.bad('Payment signature mismatch', 400);
  const sb = L.admin();
  const { data: order } = await sb.from('orders').select('*').eq('razorpay_order_id', razorpay_order_id).single();
  if (!order || order.user_id !== user.id) return L.bad('Order not found', 404);
  await L.fulfil(sb, order, razorpay_payment_id, 'payment');
  return L.json(200, { ok: true, pack: L.PACKS[order.pack].name });
};
