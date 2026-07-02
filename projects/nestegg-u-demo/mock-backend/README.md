# Mock backend — deploy to a scratch Vercel project

Throwaway demo scaffolding for the NestEgg U voice demo. In-memory state, synthetic data only.
This folder is laid out for **zero-config Vercel**:

```
mock-backend/
  api/poc/[tool].js         # the 3 webhook tools, routed by the {tool} path segment
                            #   -> /api/poc/verify_caller, /api/poc/send_reset_email, /api/poc/document_resolution
  public/reset/index.html   # the mock reset page the email links to -> served at /reset
  package.json              # { "type": "module" } so the handler's `export default` works
  .env.example              # the env vars to set in the Vercel project
```

## Deploy (Vercel CLI — fastest)

```bash
npm i -g vercel                 # if you don't have it
cd projects/nestegg-u-demo/mock-backend
vercel link                     # link to the existing "Lumio Retirement" project (where RESEND_API_KEY lives)
vercel                          # first deploy -> gives you a preview URL
```

Then set env vars (Vercel dashboard → Settings → Environment Variables, or `vercel env add`):

| Var | Value |
|---|---|
| `RESEND_API_KEY` | your Resend key (already set) |
| `RESEND_FROM` | `onboarding@resend.dev` (or a verified sender) |
| `DEMO_EMAIL` | your Resend **account** email (so the onboarding sender can deliver to it) |
| `RESET_PAGE_URL` | `https://<your-deployment>/reset` (grab it from the first deploy) |

Redeploy to production so the env vars take effect:

```bash
vercel --prod
```

## Test end-to-end

```bash
# 1. verify a caller (happy-path identity)
curl -X POST https://<your-deployment>/api/poc/verify_caller \
  -H "Content-Type: application/json" -d '{"last4_ssn":"0123","dob":"1968-04-12"}'
# -> {"verified":true,"subject_ref":"poc-subject-001","has_email_on_file":true}

# 2. send the reset email (should land in DEMO_EMAIL)
curl -X POST https://<your-deployment>/api/poc/send_reset_email \
  -H "Content-Type: application/json" -d '{"subject_ref":"poc-subject-001"}'
# -> {"sent":true,"delivered_to":"t***@gmail.com"}

# 3. open the reset page in a browser
open https://<your-deployment>/reset
```

The no-email transfer branch uses the second identity: `{"last4_ssn":"0000","dob":"1970-01-01"}`
→ `has_email_on_file:false`.
