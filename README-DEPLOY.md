# BimaPrep – deployment guide (sign-in, UPI payments with approval, admin)

Deployed through GitHub → Netlify. Database and sign-in on Supabase.

## A. Supabase (database + sign-in)
1. SQL Editor → run `supabase/schema.sql` once (already done), then run `supabase/schema_v2_upi.sql` once
   (adds UTR/screenshot columns, the private `proofs` storage bucket and permissions).
2. Authentication → URL Configuration: Site URL `https://bimaprep.in`; Redirect URLs
   `https://bimaprep.in/*` and `https://bimaprep-app.netlify.app/*`.
3. Settings → API Keys: Project URL → SUPABASE_URL; anon public key → SUPABASE_ANON_KEY;
   service_role / secret key → SUPABASE_SERVICE_ROLE_KEY (never share).

## B. UPI payments (manual approval)
Payments are collected by UPI QR; you approve each one in Admin → Payments.
1. Netlify → Environment variables → add `UPI_ID` = your UPI ID (e.g. `name@okaxis`) and
   `UPI_NAME` = the name shown in the UPI app (e.g. `BimaPrep`).
2. Set `PAYMENTS_LIVE` = `true` to show the Buy buttons. Trigger deploy after changing variables.

How it works: Buy → QR + UPI ID + reference (BP-XXXXXX) → user pays → enters UTR + uploads screenshot →
request shows as *pending* in Admin → Payments → **Approve** activates the pack for 90 days, **Reject**
stores a note the user sees on their account page. A 100% coupon unlocks instantly without payment.

## C. GitHub
Repository `BimaPrep` holds the code. To update: upload the changed files (keep the folder names
`bank/`, `netlify/functions/`, `supabase/`). Netlify redeploys automatically within a minute.

## D. Netlify
Project `bimaprep-app` imports from GitHub. Publish directory `.`, functions `netlify/functions`.
Environment variables:

| Key | Value |
|---|---|
| SUPABASE_URL | from A.3 |
| SUPABASE_ANON_KEY | from A.3 |
| SUPABASE_SERVICE_ROLE_KEY | from A.3 |
| UPI_ID | your UPI ID |
| UPI_NAME | name shown in UPI apps |
| PAYMENTS_LIVE | `true` to open payments, `false` to show "Notify me" |

(RAZORPAY_* variables are no longer used and can be deleted.)
After changing variables: Deploys → Trigger deploy → Deploy project.
Domain: move `bimaprep.in` from the old drag-and-drop project to `bimaprep-app` (Domain management).

## E. Test
1. Sign in with ravi.nsit11@gmail.com → **Admin** appears in the menu.
2. From a second account: Pricing → Buy → QR appears → pay → enter UTR + screenshot → Submit.
3. Admin → Payments → the request is listed with the screenshot → Approve → the second account's
   account page shows the pack and the mocks unlock.
4. Instant-unlock path: Admin → Coupons → `TEST100`, percent, 100 → Buy with that coupon.

## Catalogue (packs, subjects, prices, what is on sale)
`catalog.json` at the site root is the single source of truth for both the page and the server functions:
Licentiate pack, IC-38 pack, and every Associateship/Fellowship paper with its price and `"ready"` flag.
To put a subject on sale: upload its five files `bank/<ID>_m1..m5.json`, set `"ready": true` for that
subject in `catalog.json`, commit. Until then it shows "Coming soon · Notify me" and cannot be bought
(admin can still grant access). Prices: change the number in `catalog.json`; no code change needed.

## Updating the site later
Edit files on github.com (pencil icon) or upload new versions. Question bank: replace files in `bank/`.
