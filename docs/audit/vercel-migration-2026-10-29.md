# Vercel migration and learner issue repairs — 29 October 2026

## Production hosting

- Destination: `inememmanuel-5823s-projects/train-ai`, connected to `Emmy-Inem/train-ai`, production branch `main`.
- Added and verified `trainailtd.com` and `www.trainailtd.com` through two IONOS `_vercel` TXT records. Vercel reports valid configuration for both. The existing website A records already match Vercel's recommendations.
- The apex domain serves production; `www` redirects to the apex with HTTP 308. Both addresses and `train-ai-sand.vercel.app` were checked to serve the same new application bundle over HTTPS.
- Configured the canonical Supabase URL/public key and the supplied public Paystack, Stripe and OneSignal settings in Vercel. No private server secret is exposed through a `VITE_*` variable.
- Local `origin` now points to the destination repository. The original repository remains available as `previous-host`. Corrected the local Git identity to the authenticated destination owner; subsequent Git deployments were accepted.
- Added a deployment upload allowlist. Private documents, local credentials and audit fixtures are excluded. Shared payment source needed by the frontend is included.
- Supabase remains the existing production database, `jeobggrtxeybxvlwpxvn`. No database migration to a new project was performed.

## Authentication

- Supabase's Site URL is now the canonical apex domain. Added the destination Vercel hostname to its authentication redirect list.
- Deployed the corrected `send-password-reset` function through the production dashboard. It uses the existing atomic email/IP limiter, the existing Resend sender, approved redirect hosts and neutral responses for unknown accounts. It never returns recovery credentials to the requesting browser.
- Password-reset requests no longer treat a generic success response as confirmed email delivery, expose a returned recovery link/code, or bypass a failed/rate-limited server request with additional sends.
- The authorized reset-email test was accepted by the provider; the user confirmed receipt and that the link opens the new-password screen. No password was changed by the agent.
- Removed fabricated owner sessions following failed authentication. Sign-in uses the unified authentication client once per candidate address and distinguishes an invalid password from an invalid API key.
- Ahmad's supplied account is confirmed, has a password, is not banned, has active Sara Foundation membership and is already a learner in CAP Cohort 3. Its unrelated suspended organization membership was left intact.
- Samad's supplied address initially had no Auth account or matching profile. The user explicitly authorized a new learner invitation and CAP Cohort 3 assignment. The native invitation created the account; active organization membership and CAP Cohort 3 assignment are verified below.
- Invitation callbacks now open password setup for both native invitation tokens and token-hash links. Ordinary signup links do not enter password setup.

## Course media and content

- Curriculum saves now retain existing lesson IDs, notes/progress references and untouched content. Both database-style and frontend-style video/duration fields are accepted. A failed update stops before removing lessons; only explicitly removed lesson IDs are deleted.
- The reported MongoDB lesson stores a shared MEGA folder, not a direct video stream. The player now offers an explicit folder-opening action. Individual MEGA file links use the provider embed. YouTube Shorts/mobile/privacy URLs and Vimeo unlisted links are recognized.
- Missing/failed video sources have an honest message; failed streams have a retry action. State resets when switching lessons, and YouTube messages are restricted to the actual player frame and provider origin.
- A real HTML5 video was verified playing in the browser with its actual duration. MEGA folder source parsing and the folder-opening UI were checked using a synthetic fixture. MEGA itself could not be opened because the browser's site-safety policy blocked that host; hosted-file availability remains unverified.
- With explicit user approval, unpublished four empty courses: AI Fundamentals, Leadership Essentials, Workplace Compliance 101 and Data Literacy for Teams. Exactly four production rows changed from published to unpublished. Enrollments and progress were retained. They can be republished after content is added.
- The three text lessons in Getting Started with Train AI were retained.

## Payments and remaining configuration

- With explicit user approval, saved the supplied `PAYSTACK_SECRET_KEY` in Supabase's encrypted server secrets. No financial transaction was performed.
- The user will add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` later. Stripe remains awaiting configuration; its public key alone does not complete checkout.
- Supabase custom SMTP remains unset. The repaired password-reset flow uses the existing Resend Edge Function; native signup/invitation delivery requires separate verification.

## Validation and evidence

- 44 automated tests passed, including media parsing, preservation of lesson identity/content, failed-save behavior, recovery response handling, atomic limiter use, approved redirect checks and individual complimentary-seat authorization.
- Production website build passed.
- Domain configuration: `vercel-migration/verified-domains.png`.
- Four unpublished production courses: `vercel-migration/unpublished-courses.png`.
- Samad active in CAP Cohort 3 and all cohort members covered: `vercel-migration/cohort-access-confirmed.png`.

## Samad invitation outcome

The native invitation was sent and the new Auth account/profile were confirmed in production. Invitation acceptance is pending the learner. Samad is now an active Sara Foundation member in CAP Cohort 3.

The original membership transaction correctly rolled back because Sara Foundation has zero recorded organization seat credits. The user clarified that free access should cover cohort members rather than the entire organization. Applied individual, nontransferable complimentary-seat allowances to the 34 distinct existing cohort members plus Samad (35 people). Verified that zero current cohort members lack an allowance. No general organization seat credits were issued and no payment was charged.

The allowance table is inaccessible to ordinary authenticated/anonymous clients; only privileged database operations can issue allowances. Its membership check matches both user and organization. Ordinary full-capacity invitations still fail and shareable-link requests still queue. Tenant, role and cohort membership checks continue to apply. Tests verify same-user/same-organization scoping and deny self-issued allowances. Existing suspended memberships were not reactivated. Future cohort members require their own allowance or normal available seats.

Migration: `202610290001_individual_complimentary_seats.sql`. Production cohort-specific rows were applied separately under the user's explicit authorization.

Application deployment `ecdcca919de5be9167bdad56e5789f491ec54df6` was verified `READY`; root, www and sand hostnames served the same application bundle. Later commits record the database migration and audit evidence.
