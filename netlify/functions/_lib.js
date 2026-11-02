// Shared helpers for BimaPrep Netlify Functions
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Catalogue is the single source of truth (site root catalog.json): bundles + per-subject packs
const CATALOG = require('../../catalog.json');
const PACKS = {};
for (const p of CATALOG.packs) PACKS[p.id] = { name: p.name, price: p.price, days: CATALOG.days, ready: !!p.ready };
for (const s of CATALOG.subjects) if (!s.pack) PACKS[s.id] = { name: `${s.code} ${s.name}`, price: s.price, days: CATALOG.days, ready: !!s.ready };

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
  await sb.from('orders').update({ status: source === 'free' ? 'free' : 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
  await sb.from('entitlements').insert({ user_id: order.user_id, pack: order.pack, source: source === 'free' ? 'coupon' : 'payment', expires_at: expires, order_id: order.id, note: (order.coupon_code ? `coupon ${order.coupon_code}` : '') + (order.utr ? ` UTR ${order.utr}` : '') || null });
  if (order.coupon_code) await sb.from('coupon_uses').insert({ code: order.coupon_code, user_id: order.user_id, order_id: order.id });
  return { ...order, status: 'paid' };
}

// short human reference for an order id, e.g. BP-7F3K2
function reference(orderId) { return 'BP-' + String(orderId).replace(/-/g, '').slice(-6).toUpperCase(); }

function hmac(secret, data) { return crypto.createHmac('sha256', secret).update(data).digest('hex'); }
function safeEqual(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && crypto.timingSafeEqual(x, y); }

async function audit(sb, actor, action, target, detail) {
  await sb.from('audit_log').insert({ actor, action, target, detail });
}

module.exports = { PACKS, CATALOG, env, admin, userFromRequest, json, bad, parse, validateCoupon, fulfil, hmac, safeEqual, audit, reference };
