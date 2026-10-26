# BimaPrep – deployment guide (sign-in, payments, admin)

This version of the site needs a small server part (Netlify Functions), so it is deployed
through GitHub → Netlify instead of drag-and-drop. One-time setup, about 45 minutes.

## A. Supabase (database + sign-in) — 10 min
1. supabase.com → project **BimaPrep** → left menu **SQL Editor** → **New query** →
   paste the whole of `supabase/schema.sql` → **Run**. It should say "Success".
2. Left menu **Authentication → URL Configuration**:
   - Site URL: `https://bimaprep.in`
   - Redirect URLs: add `https://bimaprep.in/*` and `https://bimaprep.netlify.app/*`
3. **Authentication → Providers → Email**: keep *Enable email provider* on.
   *Confirm email*: ON is safer (users must click a link). Supabase's built-in mailer
   allows only a few emails per hour, so before announcing the site set up free SMTP:
   **Project Settings → Authentication → SMTP Settings** with Brevo (brevo.com, free 300 mails/day)
   or Resend. Until then, you can keep *Confirm email* OFF for testing.
4. **Project Settings → API**: you will copy from here into Netlify:
   - `Project URL`            → SUPABASE_URL
   - `anon public` key        → SUPABASE_ANON_KEY
   - `service_role` key (click Reveal) → SUPABASE_SERVICE_ROLE_KEY  (secret – never share)

## B. Razorpay (payments) — 10 min
1. dashboard.razorpay.com → switch to **Test Mode** (toggle top-left) while building.
2. **Account & Settings → API Keys → Generate Test Key**. Copy Key ID and Key Secret
   → RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
3. **Account & Settings → Webhooks → Add new webhook**:
   - URL: `https://bimaprep.in/.netlify/functions/razorpay-webhook`
   - Secret: type any long random text (e.g. 30 letters) → RAZORPAY_WEBHOOK_SECRET
   - Active events: tick **payment.captured** → Create.
4. When KYC is approved, repeat steps 2–3 in **Live Mode** and replace the three values in Netlify.

## C. GitHub (holds the code) — 10 min
1. github.com → sign up / sign in → **New repository** → name `bimaprep`, Private → Create.
2. On the empty repo page click **uploading an existing file** → drag the entire contents of
   this folder (index.html, bank/, netlify/, supabase/, netlify.toml, package.json, robots.txt,
   sitemap.xml, README-DEPLOY.md) → **Commit changes**.
   (Do NOT upload node_modules if present.)

## D. Netlify (hosting + functions) — 10 min
1. app.netlify.com → **Add new project → Import an existing project → GitHub** → pick `bimaprep`.
   Build command: leave empty. Publish directory: `.` (a dot). Functions directory: `netlify/functions`.
   Click **Deploy**.
2. **Project configuration → Environment variables → Add a variable** (one by one):
   | Key | Value |
   |---|---|
   | SUPABASE_URL | from A.4 |
   | SUPABASE_ANON_KEY | from A.4 |
   | SUPABASE_SERVICE_ROLE_KEY | from A.4 |
   | RAZORPAY_KEY_ID | from B.2 |
   | RAZORPAY_KEY_SECRET | from B.2 |
   | RAZORPAY_WEBHOOK_SECRET | from B.3 |
   | PAYMENTS_LIVE | `false` for now; `true` to open payments |
3. **Deploys → Trigger deploy → Deploy site** (so the variables are picked up).
4. **Domain management**: move `bimaprep.in` from the old drag-and-drop project to this one
   (Options → Remove on the old project, then Add domain here) — or simply delete the old project.

## E. Test (Razorpay Test Mode)
1. Open bimaprep.in → Sign in → Create account with ravi.nsit11@gmail.com → you should see
   an **Admin** menu item after signing in.
2. Set PAYMENTS_LIVE = `true` in Netlify and redeploy. Pricing → Buy → Razorpay test popup:
   use UPI `success@razorpay` or card 4111 1111 1111 1111, any future expiry, any CVV.
   The pack should show "Purchased" and the mocks unlock.
3. Admin → Coupons → create `TEST100`, percent, 100 → a second test account can unlock
   without paying. Admin → Grant access → unlock a colleague's email directly.
4. Admin → Payments shows every order; Supabase → Table editor shows the raw data.

## F. Go live with real money
Razorpay Live Mode keys + live webhook in Netlify → Trigger deploy. That's all.

## Updating the site later
Edit files on github.com (pencil icon) or upload new versions of files; Netlify redeploys
automatically within a minute. Question bank: replace files in `bank/`.
