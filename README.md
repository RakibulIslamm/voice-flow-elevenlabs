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

## Architecture

> Architecture diagram lands in Phase 15. Each phase adds one major capability — see project plan.

## License

Private — all rights reserved.
