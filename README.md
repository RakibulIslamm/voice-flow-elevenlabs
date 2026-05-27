# VoiceFlow

> Production-grade AI voice agent platform. Configure a custom agent (dental receptionist, restaurant host, lead qualifier) — your visitors talk to it in the browser or call your phone number, answered instantly with human-like quality.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Conversational%20AI-000)
![Twilio](https://img.shields.io/badge/Twilio-BYOK-F22F46?logo=twilio)
![Stripe](https://img.shields.io/badge/Stripe-Metered%20Billing-635BFF?logo=stripe)

---

## What it does

- **Browser voice** — visitors visit a public agent URL or embed a widget on their site, tap "Talk", and speak. Powered by ElevenLabs Conversational AI WebRTC SDK for human-like latency and quality.
- **Phone voice (BYOK Twilio)** — customers connect their own Twilio account, assign a number to an agent. Inbound calls are bridged into ElevenLabs via Twilio Media Streams.
- **Per-call summaries** — post-call transcripts are summarised by Claude Sonnet 4.6 via OpenRouter (Vercel AI SDK).
- **Secure embed** — every widget request carries an HMAC-signed JWT (5-minute TTL) plus a per-agent domain allowlist, so stolen embed codes can't be used elsewhere.
- **Metered billing** — Stripe usage-based pricing, per minute of voice time.

## Tech stack

- **Framework** — Next.js (latest, App Router) with TypeScript strict
- **UI** — Tailwind CSS + shadcn/ui
- **Auth** — Auth.js v5 (`next-auth@beta`) with Resend magic link + Google OAuth
- **Database** — MongoDB Atlas + Mongoose
- **Voice** — ElevenLabs Conversational AI (WebRTC for browser, Media Streams for phone)
- **Phone** — Twilio SDK (customer-supplied credentials, AES-256-GCM encrypted at rest)
- **AI** — OpenRouter → `anthropic/claude-sonnet-4.6` via the Vercel AI SDK
- **Email** — Resend (transactional + magic links)
- **Billing** — Stripe metered subscriptions
- **Security** — AES-256-GCM for stored secrets, HMAC-signed JWTs for widget tokens
- **Observability** — self-hosted error tracking in MongoDB
- **Deploy** — Vercel (no VPS — ElevenLabs hosts the voice pipeline)
- **Package manager** — pnpm

## Local setup

Prerequisites: **Node.js 20+**, **pnpm 10+**.

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env.local
# Fill values per phase (see .env.example for grouped categories).

# 3. Start the dev server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000).

## ElevenLabs is BYOK

**VoiceFlow does not hold a master ElevenLabs API key.** Every developer
running this locally (and every customer in production) brings their own
ElevenLabs account. After you sign up, head to **Integrations** in the
dashboard and paste your ElevenLabs API key — it's encrypted with
AES-256-GCM at rest and decrypted per-request through
[`getElevenLabsClient(userId)`](src/lib/elevenlabs/client.ts).

The platform owner also needs their own ElevenLabs account if they want
to host the demo agent on the landing page in production — that demo
agent is created in the platform owner's ElevenLabs account just like
any customer's agent.

### Two values per user, zero env vars

There are **no ElevenLabs values in `.env.local`** — the integration is
fully per-user. Each user supplies two pieces from their ElevenLabs
dashboard:

1. **API key** — copied from
   [Profile → API Keys](https://elevenlabs.io/app/settings/api-keys),
   pasted into VoiceFlow's Integrations page. Encrypted with AES-256-GCM
   at rest.
2. **Post-call webhook secret** — when the user creates a post-call
   webhook in
   [Conversational AI → Settings](https://elevenlabs.io/app/agents/settings)
   (or Developers → Webhooks, depending on plan), ElevenLabs generates a
   secret server-side and shows it once. The user copies it into
   VoiceFlow. We use it to verify the HMAC signature on every incoming
   webhook so calls from outside their workspace can't be spoofed.

Both values are stored encrypted on the user document and decrypted only
at the call site —
[`getElevenLabsClient(userId)`](src/lib/elevenlabs/client.ts) for outbound
calls,
[`verifyElevenLabsSignature(body, sig, secret)`](src/lib/elevenlabs/verify-signature.ts)
for incoming webhooks.

### Sanity-check the integration

After connecting your ElevenLabs key from the Integrations dashboard,
hit:

```
GET /api/internal/elevenlabs-test
```

Any signed-in user can call this — it only reads its caller's own
integration. Returns `{ ok: true, voiceCount, tier, charactersUsed, … }`
if your BYOK flow works end-to-end, or a clean
`INTEGRATION_DISCONNECTED` error if the key isn't connected yet.

## Twilio is BYOK too

**Phone calling is gated behind the Pro plan.** On Pro or Business, users connect
their own Twilio account in **Integrations** — VoiceFlow stores Account SID +
Auth Token AES-256-GCM-encrypted on the user document. From the agent's
**Channels** tab, they pick one of their Twilio numbers; we point that number's
Voice webhook at `/api/twilio/incoming?agentId=...` and provision a phone-side
ElevenLabs agent in their account on first assign. Inbound calls bridge into
the agent via Twilio Media Streams (`<Connect><Stream>` TwiML).

### BYOK Twilio billing model

- **You pay Twilio directly** for telecom: phone numbers (~$1/mo each), inbound
  minutes (~$0.014/min US).
- **VoiceFlow charges only for AI orchestration** via your VoiceFlow plan
  ($49/mo Pro or $149/mo Business — see Billing).
- **Total cost per phone minute:** roughly $0.014 (Twilio) + your ElevenLabs
  character usage + nothing extra from VoiceFlow.
- **Why?** You get full visibility and control over your costs. We don't mark
  up Twilio.

### What we never see

We hold only the SID + Auth Token, encrypted. Twilio bills you directly. If you
disconnect Twilio, we clear the webhook on every phone-enabled agent first,
then delete the encrypted creds — your phone numbers stay in your account
exactly as they were.

### Scripts

| Command              | What it does                              |
| -------------------- | ----------------------------------------- |
| `pnpm dev`           | Start the dev server (port 3000)          |
| `pnpm build`         | Build for production                      |
| `pnpm start`         | Run the production build                  |
| `pnpm lint`          | Run ESLint                                |
| `pnpm typecheck`     | TypeScript strict check (no emit)         |
| `pnpm format`        | Format with Prettier                      |
| `pnpm format:check`  | Verify formatting without writing changes |

## Project structure

```
src/
├── app/              # Next.js App Router (auth, marketing, dashboard, admin, talk, api)
├── components/       # UI primitives (shadcn) + feature-grouped components
├── lib/              # Cross-cutting: auth, db, elevenlabs, twilio, stripe, ai, email, etc.
├── hooks/            # Reusable React hooks
├── types/            # Shared TypeScript types
├── server/           # Server-only actions & queries
└── styles/           # Global / per-feature CSS

widget/               # Standalone embed widget (builds to public/widget.js)
```

## Admin access

Admin status is a per-user flag in MongoDB; there's no self-serve promotion. To grant
yourself the admin role:

```bash
mongosh "<your-mongodb-uri>" --quiet --eval \
  'db.users.updateOne({email: "you@example.com"}, {$set: {isAdmin: true}})'
```

Sign out and back in to refresh the JWT — the new `isAdmin: true` claim only takes
effect on the next session. The `/admin` link then appears in the sidebar.

## Landing page live demo

The marketing landing page (`/`) embeds a real talk widget in the **Live demo** block.
It loads `/talk/<slug>?embed=1` in an iframe, so it needs a real, public agent to point
at. To enable it:

1. Sign up for VoiceFlow on production.
2. Connect your ElevenLabs account (Integrations → ElevenLabs).
3. Create a "VoiceFlow Demo" agent with template = `dental`.
4. Set its **allowed domains** to include your production domain (so the embed is permitted).
5. Point the landing page at it — either set `NEXT_PUBLIC_DEMO_AGENT_SLUG` to the agent's
   public slug, or edit the `DEMO_AGENT_SLUG` constant in
   `src/components/marketing/demo-block.tsx`.

Until that agent exists, the demo block still renders — the iframe just shows the widget's
standard "unavailable" state. The rest of the landing page is unaffected.

## Architecture

> Architecture diagram lands in Phase 15. Each phase adds one major capability — see project plan.

## License

Private — all rights reserved.
