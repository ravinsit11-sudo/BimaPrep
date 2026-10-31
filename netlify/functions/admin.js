// Admin console API. Every action checks profiles.is_admin on the server.
const L = require('./_lib');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return L.bad('POST only', 405);
  const me = await L.userFromRequest(event); if (!me) return L.bad('Sign in first', 401);
  if (!me.is_admin) return L.bad('Admin only', 403);
  const sb = L.admin(); const b = L.parse(event); const a = b.action;
  try {
    if (a === 'users') {
      const q = (b.q || '').trim();
      let qry = sb.from('profiles').select('id,email,name,org,goal,is_admin,created_at').order('created_at', { ascending: false }).limit(100);
      if (q) qry = qry.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
      const { data: users } = await qry;
      const ids = (users || []).map(u => u.id);
      const { data: ents } = ids.length ? await sb.from('entitlements').select('user_id,pack,expires_at,source,revoked_at,id').in('user_id', ids) : { data: [] };
      const { data: att } = ids.length ? await sb.from('attempts').select('user_id,pct').in('user_id', ids) : { data: [] };
      return L.json(200, { users: (users || []).map(u => ({ ...u, entitlements: (ents || []).filter(e => e.user_id === u.id), attempts: (att || []).filter(x => x.user_id === u.id).length })) });
    }
    if (a === 'grant') {
      const { email, pack, days, note } = b; if (!L.PACKS[pack]) return L.bad('Unknown pack');
      const { data: u } = await sb.from('profiles').select('id,email').ilike('email', email.trim()).single();
      if (!u) return L.bad('No user with that email (they must sign up first)');
      const expires = days && Number(days) > 0 ? new Date(Date.now() + Number(days) * 86400000).toISOString() : null;
      const { data: e } = await sb.from('entitlements').insert({ user_id: u.id, pack, source: 'admin', expires_at: expires, note: note || 'complimentary', granted_by: me.id }).select().single();
      await L.audit(sb, me.id, 'grant', u.email, { pack, days, note });
      return L.json(200, { ok: true, entitlement: e });
    }
    if (a === 'revoke') {
      const { data: e } = await sb.from('entitlements').update({ revoked_at: new Date().toISOString() }).eq('id', b.id).select().single();
      await L.audit(sb, me.id, 'revoke', e?.user_id, { pack: e?.pack, id: b.id });
      return L.json(200, { ok: true });
    }
    if (a === 'orders') {
      const { data, error } = await sb.from('orders').select('*, profiles!orders_user_id_fkey(email,name)').neq('status', 'created').order('created_at', { ascending: false }).limit(300);
      if (error) return L.bad('Orders query failed: ' + error.message, 500);
      const orders = data || [];
      const paths = orders.filter(o => o.proof_path).map(o => o.proof_path);
      let urls = {};
      if (paths.length) {
        const { data: signed } = await sb.storage.from('proofs').createSignedUrls(paths, 3600);
        (signed || []).forEach(s => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
      }
      return L.json(200, { orders: orders.map(o => ({ ...o, reference: L.reference(o.id), proof_url: o.proof_path ? urls[o.proof_path] || null : null })) });
    }
    if (a === 'approve' || a === 'reject') {
      const { data: o } = await sb.from('orders').select('*').eq('id', b.id).single();
      if (!o) return L.bad('Order not found');
      if (o.status !== 'pending') return L.bad('Order is ' + o.status + ', not pending');
      if (a === 'approve') {
        await L.fulfil(sb, o, o.utr, 'manual');
        await sb.from('orders').update({ reviewed_by: me.id, reviewed_at: new Date().toISOString(), review_note: b.note || null }).eq('id', o.id);
      } else {
        await sb.from('orders').update({ status: 'rejected', reviewed_by: me.id, reviewed_at: new Date().toISOString(), review_note: b.note || 'rejected' }).eq('id', o.id);
      }
      await L.audit(sb, me.id, a, o.user_id, { pack: o.pack, amount: o.final_amount, utr: o.utr, reference: L.reference(o.id), note: b.note || null });
      return L.json(200, { ok: true });
    }
    if (a === 'coupons') {
      const { data: coupons } = await sb.from('coupons').select('*').order('created_at', { ascending: false });
      const { data: uses } = await sb.from('coupon_uses').select('code');
      const count = {}; (uses || []).forEach(u => count[u.code] = (count[u.code] || 0) + 1);
      return L.json(200, { coupons: (coupons || []).map(c => ({ ...c, uses: count[c.code] || 0 })) });
    }
    if (a === 'coupon_save') {
      const c = b.coupon || {}; const code = String(c.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return L.bad('Code: 3–20 letters/numbers');
      if (!['percent', 'flat'].includes(c.kind) || !(Number(c.value) > 0)) return L.bad('Give a discount type and value');
      if (c.kind === 'percent' && Number(c.value) > 100) return L.bad('Percent cannot exceed 100');
      const row = { code, kind: c.kind, value: Number(c.value), packs: c.packs && c.packs.length ? c.packs : null, valid_from: c.valid_from || new Date().toISOString(), valid_to: c.valid_to || null, max_uses: c.max_uses ? Number(c.max_uses) : null, max_uses_per_user: Number(c.max_uses_per_user || 1), active: c.active !== false, note: c.note || null, created_by: me.id };
      const { error } = await sb.from('coupons').upsert(row); if (error) return L.bad(error.message);
      await L.audit(sb, me.id, 'coupon_save', code, row);
      return L.json(200, { ok: true });
    }
    if (a === 'coupon_toggle') {
      await sb.from('coupons').update({ active: !!b.active }).eq('code', b.code);
      await L.audit(sb, me.id, 'coupon_toggle', b.code, { active: !!b.active });
      return L.json(200, { ok: true });
    }
    if (a === 'set_admin') {
      const { data: u } = await sb.from('profiles').select('id,email').ilike('email', (b.email || '').trim()).single();
      if (!u) return L.bad('No user with that email');
      await sb.from('profiles').update({ is_admin: !!b.value }).eq('id', u.id);
      await L.audit(sb, me.id, 'set_admin', u.email, { value: !!b.value });
      return L.json(200, { ok: true });
    }
    if (a === 'attempts') {
      const { data } = await sb.from('attempts').select('id,user_id,mock_id,title,correct,total,pct,created_at, profiles(email,name)').order('created_at', { ascending: false }).limit(300);
      return L.json(200, { attempts: data || [] });
    }
    if (a === 'audit') {
      const { data } = await sb.from('audit_log').select('*, profiles(email)').order('created_at', { ascending: false }).limit(200);
      return L.json(200, { log: data || [] });
    }
    if (a === 'interest') {
      const { data } = await sb.from('notify_interest').select('*').order('created_at', { ascending: false }).limit(500);
      return L.json(200, { interest: data || [] });
    }
    return L.bad('Unknown action');
  } catch (e) { return L.bad(e.message, 500); }
};
