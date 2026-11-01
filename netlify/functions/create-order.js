// Start a purchase: validates pack + coupon on the server.
// preview:true  -> only returns the amount after coupon (nothing saved)
// otherwise     -> creates an order (status 'created') and returns the UPI payment details,
//                  or unlocks immediately when a coupon makes it free.
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const user = await L.userFromRequest(event); if (!user) return L.bad('Sign in first', 401);
  const { pack, coupon, preview } = L.parse(event);
  const p = L.PACKS[pack]; if (!p) return L.bad('Unknown pack');
  if (!p.ready) return L.bad('This paper is not open for purchase yet. Click Notify me and we will email you when it launches.');
  const sb = L.admin();
  const { data: active } = await sb.from('active_entitlements').select('id,expires_at').eq('user_id', user.id).eq('pack', pack);
  if (active && active.length) return L.bad('You already have this pack. It expires on ' + (active[0].expires_at ? new Date(active[0].expires_at).toDateString() : 'never'));
  const { data: pend } = await sb.from('orders').select('id').eq('user_id', user.id).eq('pack', pack).eq('status', 'pending');
  if (pend && pend.length) return L.bad('Your payment for this pack is already awaiting approval.');
  const c = await L.validateCoupon(sb, coupon, pack, user.id, p.price);
  if (c.error) return L.bad(c.error);
  const final = p.price - c.discount;
  if (preview) return L.json(200, { amount: final, discount: c.discount, pack: p.name });
  if (final > 0 && (process.env.PAYMENTS_LIVE || 'false') !== 'true') return L.bad('Payments are not open yet');
  const { data: order, error } = await sb.from('orders').insert({ user_id: user.id, pack, list_amount: p.price, coupon_code: c.code, discount: c.discount, final_amount: final, status: 'created' }).select().single();
  if (error) return L.bad('Could not create order: ' + error.message, 500);
  if (final <= 0) {                                  // 100% coupon: unlock without payment
    await L.fulfil(sb, order, null, 'free');
    return L.json(200, { free: true, pack: p.name });
  }
  const upiId = process.env.UPI_ID || '';
  if (!upiId) return L.bad('Payment details are not configured yet. Please email us.');
  const ref = L.reference(order.id);
  const upiName = process.env.UPI_NAME || 'BimaPrep';
  const link = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${final}&cu=INR&tn=${encodeURIComponent(ref + ' ' + pack)}`;
  return L.json(200, { free: false, orderId: order.id, amount: final, discount: c.discount, pack: p.name, reference: ref, upiName, upiLink: link });
};
