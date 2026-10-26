// Start a purchase: validates pack + coupon on the server, creates a Razorpay order (or unlocks free)
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const user = await L.userFromRequest(event); if (!user) return L.bad('Sign in first', 401);
  const { pack, coupon } = L.parse(event);
  const p = L.PACKS[pack]; if (!p) return L.bad('Unknown pack');
  const sb = L.admin();
  const { data: active } = await sb.from('active_entitlements').select('id,expires_at').eq('user_id', user.id).eq('pack', pack);
  if (active && active.length) return L.bad('You already have this pack. It expires on ' + (active[0].expires_at ? new Date(active[0].expires_at).toDateString() : 'never'));
  const c = await L.validateCoupon(sb, coupon, pack, user.id, p.price);
  if (c.error) return L.bad(c.error);
  const final = p.price - c.discount;
  const { data: order, error } = await sb.from('orders').insert({ user_id: user.id, pack, list_amount: p.price, coupon_code: c.code, discount: c.discount, final_amount: final, status: 'created' }).select().single();
  if (error) return L.bad('Could not create order: ' + error.message, 500);
  if (final <= 0) {                                  // 100% coupon: unlock without payment
    await L.fulfil(sb, order, null, 'free');
    return L.json(200, { free: true, pack: p.name });
  }
  if ((process.env.PAYMENTS_LIVE || 'false') !== 'true') return L.bad('Online payment is not open yet');
  const rz = await L.razorpay('/orders', 'POST', { amount: final * 100, currency: 'INR', receipt: order.id, notes: { pack, user: user.email, coupon: c.code || '' } });
  await sb.from('orders').update({ razorpay_order_id: rz.id }).eq('id', order.id);
  return L.json(200, { free: false, razorpayOrderId: rz.id, amount: final, keyId: L.env('RAZORPAY_KEY_ID'), pack: p.name, discount: c.discount, email: user.email, name: user.name || '' });
};
