// Public configuration for the browser (only values that are safe to expose)
const { json } = require('./_lib');
exports.handler = async () => json(200, {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  paymentsLive: (process.env.PAYMENTS_LIVE || 'false') === 'true',
});
