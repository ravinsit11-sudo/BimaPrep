// Shared helpers for BimaPrep Netlify Functions
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const PACKS = {
  licentiate: { name: 'Licentiate pack', price: 999, days: 90 },
  associate:  { name: 'Associateship pack', price: 1999, days: 90 },
  fellowship: { name: 'Fellowship pack', price: 2999, days: 90 },
  ic38:       { name: 'IC-38 Agent exam', price: 799, days: 90 },
};

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

function admin() {               // service-role client: bypasses RLS, server only
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

async function userFromRequest(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  return profile ? { ...profile, auth: data.user } : { id: data.user.id, email: data.user.email, is_admin: false, auth: data.user };
}

function json(status, body) {
  return { statusCode: status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}
function bad(msg, status = 400) { return json(status, { error: msg }); }

function parse(event) { try { return JSON.parse(event.body || '{}'); } catch { return {}; } }

// ---- coupon validation (server side only) ----
async function validateCoupon(sb, codeRaw, packId, userId, listAmount) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) return { discount: 0, code: null };
  const { data: c } = await sb.from('coupons').select('*').eq('code', code).single();
  if (!c || !c.active) return { error: 'Coupon not found or inactive' };
  const now = new Date();
  if (c.valid_from && new Date(c.valid_from) > now) return { error: 'Coupon not yet valid' };
  if (c.valid_to && new Date(c.valid_to) < now) return { error: 'Coupon has expired' };
  if (c.packs && c.packs.length && !c.packs.includes(packId)) return { error: 'Coupon does not apply to this pack' };
  const { count: total } = await sb.from('coupon_uses').select('*', { count: 'exact', head: true }).eq('code', code);
  if (c.max_uses != null && (total || 0) >= c.max_uses) return { error: 'Coupon usage limit reached' };
  const { count: mine } = await sb.from('coupon_uses').select('*', { count: 'exact', head: true }).eq('code', code).eq('user_id', userId);
  if ((mine || 0) >= c.max_uses_per_user) return { error: 'You have already used this coupon' };
  let discount = c.kind === 'percent' ? Math.round(listAmount * c.value / 100) : c.value;
  discount = Math.max(0, Math.min(discount, listAmount));
  return { discount, code };
}

// ---- fulfilment: mark order paid + create entitlement (idempotent) ----
async function fulfil(sb, order, paymentId, source) {
  if (order.status === 'paid' || order.status === 'free') return order;   // already done
  const pack = PACKS[order.pack];
  const expires = new Date(Date.now() + pack.days * 86400000).toISOString();
  await sb.from('orders').update({ status: source === 'free' ? 'free' : 'paid', razorpay_payment_id: paymentId || null, paid_at: new Date().toISOString() }).eq('id', order.id);
  await sb.from('entitlements').insert({ user_id: order.user_id, pack: order.pack, source: source === 'free' ? 'coupon' : 'payment', expires_at: expires, order_id: order.id, note: order.coupon_code ? `coupon ${order.coupon_code}` : null });
  if (order.coupon_code) await sb.from('coupon_uses').insert({ code: order.coupon_code, user_id: order.user_id, order_id: order.id });
  return { ...order, status: 'paid' };
}

function hmac(secret, data) { return crypto.createHmac('sha256', secret).update(data).digest('hex'); }
function safeEqual(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && crypto.timingSafeEqual(x, y); }

async function razorpay(path, method = 'GET', body) {
  const auth = Buffer.from(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`).toString('base64');
  const r = await fetch(`https://api.razorpay.com/v1${path}`, { method, headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.description || `Razorpay error ${r.status}`);
  return data;
}

async function audit(sb, actor, action, target, detail) {
  await sb.from('audit_log').insert({ actor, action, target, detail });
}

module.exports = { PACKS, env, admin, userFromRequest, json, bad, parse, validateCoupon, fulfil, hmac, safeEqual, razorpay, audit };
