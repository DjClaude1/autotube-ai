# AutoTube AI

AI-powered system that turns a single topic into a ready-to-post YouTube video: viral idea + title, full script (hook / body / CTA), ElevenLabs voiceover, subtitles burned in with FFmpeg, and a downloadable MP4 — all behind a clean SaaS dashboard with credits and Stripe billing.

```
 topic  ─▶ GPT idea ─▶ GPT script ─▶ ElevenLabs TTS ─▶ scenes + SRT ─▶ FFmpeg render ─▶ Supabase Storage ─▶ MP4
```

## Stack

- **Frontend** — Next.js 14 (App Router) + Tailwind, Supabase Auth via `@supabase/ssr`
- **Backend API** — Node.js + Express + Zod, Supabase service-role client
- **Queue / worker** — BullMQ on Redis
- **AI** — OpenAI (`gpt-4o-mini` by default) for idea + script, ElevenLabs for TTS
- **Video** — FFmpeg (per-scene clips → concat → mux narration → thumbnail)
- **DB + storage + auth** — Supabase (Postgres + Storage + auth.users)
- **Billing** — Stripe Checkout + webhooks, credit ledger in Postgres

## Repo layout

```
autotube-ai/
├── web/                     # Next.js app (dashboard, auth, billing UI)
├── server/                  # Express API + BullMQ worker (same codebase)
│   ├── src/index.ts         #   HTTP entry
│   ├── src/worker.ts        #   worker entry
│   └── src/pipeline/*       #   idea → script → tts → scenes → ffmpeg
├── supabase/migrations/     # SQL schema, RLS, RPCs, storage bucket
├── docker-compose.yml       # Redis + api + worker (for local/prod Docker)
└── .env.example             # all env vars, annotated
```

## 1. Local dev quickstart

### Prerequisites

- Node 20+
- `ffmpeg` and `ffprobe` on your `PATH`
- A Supabase project, an OpenAI key, an ElevenLabs key, a Stripe test account

### Steps

```bash
# 1. Clone + install
git clone https://github.com/DjClaude1/autotube-ai
cd autotube-ai
npm install

# 2. Start Redis (via Docker) — or point REDIS_URL at your own
docker compose up -d redis

# 3. Apply the DB schema
# Either paste supabase/migrations/0001_init.sql into the Supabase SQL editor,
# OR use the Supabase CLI:
#   supabase db push  (after linking the project)

# 4. Configure env
cp .env.example .env
cp server/.env.example server/.env
cp web/.env.example web/.env.local
# ...fill in the keys

# 5. Run everything
npm run dev
# web   → http://localhost:3000
# api   → http://localhost:4000
# worker runs alongside the api
```

### Stripe webhook (local)

```bash
stripe listen --forward-to http://localhost:4000/webhooks/stripe
```

Copy the `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET`.

Create one or more Products + Prices in the Stripe dashboard (e.g. "10 credits = $5"), then set:

```
STRIPE_CREDIT_PACKS=price_abc:10,price_def:55,price_ghi:240
```

The format is `priceId:creditsGranted`, comma-separated.

## 2. Supabase setup

1. Create a project at https://supabase.com.
2. In the SQL editor, paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it. This creates:
   - `public.profiles` with an atomic credit balance
   - `public.videos` (status enum, progress, scenes JSON, URLs)
   - `public.credit_events` ledger with idempotent Stripe event IDs
   - RPCs: `spend_credits`, `refund_credits`, `add_credits`
   - `on_auth_user_created` trigger → inserts profile + grants signup bonus
   - Row-Level Security so users can only see their own rows
   - Public Storage bucket `autotube-videos`
3. Grab the project URL, the anon key (client), and the service role key (server).

## 3. Backend API

Base URL: `http://localhost:4000`. All `/api/*` endpoints require a Supabase JWT:

```
Authorization: Bearer <supabase access_token>
```

| Method | Route                     | Description                                           |
| ------ | ------------------------- | ----------------------------------------------------- |
| GET    | `/health`                 | Health check (no auth)                                |
| POST   | `/api/generate`           | Body `{ topic }`. Deducts 1 credit, enqueues render.  |
| GET    | `/api/videos`             | List the caller's videos + status + progress.         |
| GET    | `/api/videos/:id`         | Full video detail (idea, script, scenes, URL).        |
| GET    | `/api/credits`            | Current balance + last 50 credit events.              |
| GET    | `/api/billing/packs`      | Available credit packs (configured via env).          |
| POST   | `/api/billing/checkout`   | Body `{ price_id }`. Returns a Stripe Checkout URL.   |
| POST   | `/webhooks/stripe`        | Raw body. Stripe webhook, grants credits on paid.     |

### Pipeline stages (written back to `videos.status`)

`queued → generating_idea → generating_script → generating_voice → splitting_scenes → rendering → uploading → completed` (or `failed` / `canceled`).

If the final attempt fails, the worker refunds the credit automatically.

### Retries & rate limits

- OpenAI + ElevenLabs calls go through `withRetry()` with exponential backoff, jitter, and honors `Retry-After` headers on `429`.
- BullMQ limits rendering to 30 jobs / minute per worker (`limiter` in `server/src/worker.ts`) and retries each job 3 times with exponential backoff.

## 4. Frontend

- `/` — marketing page
- `/login`, `/signup` — Supabase email/password auth
- `/dashboard` — generate form + credits badge
- `/dashboard/videos` — grid of all videos with thumbnails
- `/dashboard/videos/[id]` — live progress bar, script preview, download + preview player on completion
- `/dashboard/billing` — credit packs, Stripe checkout, credit history

## 5. Deployment

### Frontend → Vercel

1. `cd web && vercel link`
2. Set env vars in Vercel (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` — your Render API URL, e.g. `https://autotube-api.onrender.com`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Deploy. Add your Vercel production URL to Supabase → Auth → Redirect URLs.

### Backend → Render

You need three services on Render: **API**, **worker**, and **Redis**.

1. Create a Render Redis (the $7 "Starter" tier is enough to begin).
2. Create a **Web Service** from this repo:
   - Root Directory: `server`
   - Runtime: Docker (uses `server/Dockerfile`) — or Node with build `npm install && npm run build`, start `npm start`
   - Env vars from `server/.env.example` (fill real values)
   - Set `WEB_URL` to your Vercel URL
3. Create a **Background Worker** (same repo, same env):
   - Root Directory: `server`
   - Start command: `node dist/worker.js` (Docker) or `npm run start:worker`
4. Point `REDIS_URL` at the Render Redis `rediss://…` connection string.
5. In Stripe → Developers → Webhooks, add an endpoint `https://YOUR-API.onrender.com/webhooks/stripe` listening for `checkout.session.completed`. Paste its signing secret into `STRIPE_WEBHOOK_SECRET`.

### Deploy checklist

- [ ] `supabase/migrations/0001_init.sql` applied
- [ ] Supabase Storage bucket `autotube-videos` exists and is public
- [ ] Stripe products + prices created, `STRIPE_CREDIT_PACKS` set
- [ ] Stripe webhook secret set (`STRIPE_WEBHOOK_SECRET`)
- [ ] `WEB_URL` on the API matches the actual Vercel URL (CORS)
- [ ] `NEXT_PUBLIC_API_URL` on the web matches the actual Render API URL
- [ ] Worker has access to the same Redis + Supabase env as the API

## 6. Cost model

Each video generation:
- 1 credit deducted atomically before enqueueing.
- If the render fails 3 times, the worker refunds the credit.
- Credit events are in `credit_events` — every movement (signup bonus, purchase, spend, refund) is auditable.

## 7. Customizing background footage

By default `server/src/pipeline/ffmpeg.ts` generates animated gradient backgrounds as placeholders, so the app works with zero external assets. To use your own stock footage:

- Pass `backgroundClips: string[]` into `renderVideo(...)` — the worker cycles them scene-by-scene.
- Or extend `runPipeline` to fetch from Pexels / Pixabay / your own S3 bucket based on the `idea.tags`.

## 8. Scripts

| Script             | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Runs web + api + worker in watch mode              |
| `npm run build`    | Builds both workspaces                             |
| `npm run lint`     | Lints both workspaces                              |
| `npm run typecheck`| Type-checks both workspaces                        |

## License

MIT — do whatever you want.
