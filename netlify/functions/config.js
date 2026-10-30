// Public configuration for the browser (only values that are safe to expose)
const { json } = require('./_lib');
exports.handler = async () => json(200, {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  upiId: process.env.UPI_ID || '',
  upiName: process.env.UPI_NAME || 'BimaPrep',
  paymentsLive: (process.env.PAYMENTS_LIVE || 'false') === 'true',
});
