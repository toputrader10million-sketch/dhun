# Dhun (ধুন) — Free Music PWA

> Your music, your rules. Installable PWA • YouTube catalog + Audius indie streams • offline downloads • cloud sync • Chromecast • Bangla UI • Dhun Pro — **no ads, no tracking, no payment. Ever.**

Dhun is a production-ready progressive web app music player that mirrors YouTube Music's core experience — and goes beyond it with features the big platforms don't give away: a 10-band per-source EQ, pro sleep timer, karaoke lyrics, AI DJ & playlist builder, natural-language search, region charts, device-level offline caching, multi-device library sync, Chromecast, and a full Bangla interface — all on 100% free public APIs.

**Live:** https://dhun-gamma-wheat.vercel.app

---

## The honest pitch

- **Core music is free forever.** Playback, search, charts, library, lyrics, offline downloads, sync, sleep timer, cast, PWA install, Bangla UI — every core feature works without an account, without ads, forever.
- **"Dhun Pro" is free too.** It's a comfort layer (extra themes, AI DJ, AI playlist builder, pro EQ, visualizer modes, public share-links, accent designer) unlocked four honest ways: one tap, a loyalty code earned by listening, feedback, or a share code. There is no payment system anywhere in the codebase.
- **Honest messaging everywhere.** When something can't be done (a track blocks embedding, lyrics don't exist yet, the network type is unknown), Dhun says so instead of faking it.

## Feature map (60-day build)

| Area | Highlights |
|---|---|
| **Playback** | YouTube official embed (always available) · Hi-Fi direct-stream engine via same-origin proxy (Audius/Jamendo) with Web Audio graph · crossfade + gapless · per-source EQ profiles · 3 visualizer modes · cast to Chromecast with remote volume |
| **Discovery** | Region charts (BD/IN/PK/US/GB/DE/JP/Global) · genre × region charts · Audius trending · Waves editorial · discovery feed ("because you played…") · community Loved chart (anonymous reactions) · smart home feed (time-of-day + live weather) |
| **AI (free, cached, honest fallbacks)** | Dhun Copilot chat (catalog-aware) · AI DJ Daily Mix · natural-language search ("rainy evening Bangla songs") · AI playlist builder (prompt → 25-track playlist) · smart radio (mood/era/seed) · auto-mix (never stops) |
| **Your library** | Favorites · playlists (import/export JSON + DHUN1 share codes + public share-links with view counts) · history · offline downloads with progress · smart downloads (Wi-Fi-aware, capped) · sync conflict rules · artist pages with discography · queue drag-reorder + handoff to another device |
| **Lyrics** | LRCLIB 5-step pipeline + ChartLyrics fallback · karaoke line-sweep mode · Bangla script care (lang + spacing) · honest "no lyrics found" states |
| **Platform** | Full PWA (shortcuts, share-target, `web+dhuun://` protocol handler, custom install sheet with iOS guide) · offline shell · lockscreen MediaSession · sleep timer pro (fade + stop-after-track) · desktop widget · share cards (1200×630 canvas) |
| **Trust & perf** | Bangla/English instant switch (~425 keys) · network health dashboard (instance latency graphs) · AI services status · storage manager (quota bar, per-cache clear, LRU auto-evict) · performance budget card · onboarding tour · unified empty states · reduced-motion everywhere |
| **Dhun Pro (free)** | Feature-flag system + honest upsell sheets · Imperial Gold theme · animated crown signature · Pro panel with usage dashboard (plays/streak/minutes) · 4 unlock paths (instant / loyalty / feedback / code) · premium About landing |

## Tech stack

Next.js 16 (App Router) • TypeScript • Tailwind CSS 4 + shadcn/ui • Zustand • framer-motion • Prisma + SQLite/Turso (libSQL driver adapter) • PWA (Service Worker, Cache Storage, IndexedDB) • z-ai SDK (server-side AI features, cached, with deterministic fallbacks)

---

## Quick start (local)

```bash
bun install
cp .env.example .env         # local SQLite works with zero config
bun run db:push              # create local schema
bun run dev                  # http://localhost:3000
```

No API keys are required for the core experience — catalogs, lyrics and artwork are free public APIs. AI features (Copilot, DJ, NL search, playlist builder) use the bundled z-ai SDK server-side and degrade to deterministic fallbacks when the model is unavailable.

## Deploy to Vercel + Turso (free tier friendly)

### 1. Push to GitHub

```bash
git add .
git commit -m "Dhun"
git remote add origin git@github.com:<you>/dhun.git   # or https URL
git push -u origin main
```

### 2. Create the Turso database (skip if you already have a URL + token)

```bash
turso db create music-player
turso db show music-player --url        # → TURSO_DATABASE_URL
turso db tokens create music-player     # → TURSO_AUTH_TOKEN
```

### 3. Push the Prisma schema to Turso (one-time)

```bash
# Prisma CLI doesn't accept libsql:// directly, so apply generated SQL:
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > schema.sql
# then execute schema.sql against Turso (any libSQL client):
bunx --bun node -e "
  import('@libsql/client').then(async ({createClient}) => {
    const fs = require('fs');
    const c = createClient({url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN});
    await c.executeMultiple(fs.readFileSync('schema.sql','utf8'));
    console.log('Turso schema ready');
  })"
# run with: TURSO_URL="libsql://..." TURSO_TOKEN="..." node script
```

Or simply: `DATABASE_URL="libsql://<url>?authToken=<token>" bunx prisma db push` — works on some Prisma versions.

### 4. Import the repo on Vercel

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://music-player-<id>.aws-ap-south-1.turso.io` |
| `TURSO_AUTH_TOKEN` | your Turso token |

That's it — when both vars are present the app automatically uses Turso through the Prisma libSQL driver adapter (`src/lib/db.ts`). No other keys needed. Missing tables are bootstrapped idempotently on the first request (`src/lib/db-bootstrap.ts`), so a fresh Turso database just works.

### 5. Verify

- App loads, Home shows smart feed (time + weather) + Waves + Audius Trending.
- Settings → Cloud Sync shows a sync code; enter that code on another device → library follows.
- Player: ⋮ menu → "Download for offline" → airplane mode → track still plays.
- Settings → Language: switch to বাংলা — the whole chrome switches instantly.

> **Security:** the Turso token is only ever set as a Vercel env var — never commit it. If a token leaks, rotate it with `turso db tokens create music-player`.

## Architecture snapshot

```
Browser (PWA) ── fetch /api/* ──▶ Next.js route handlers (memory cache + instance fallback)
   │  engines: IFrame ▸ Hi-Fi proxy ▸ offline Cache ▸ Cast remote    │
   │  stores:  player / library / offline / settings / cast / ui     ├─▶ Piped API   (search/meta, health-checked instances)
   │  sync:    dhun_uid cookie → User.code (8-char)                  ├─▶ Audius API  (trending/search/direct stream)
   │  AI:      /api/ai/* (z-ai SDK, response caches, rule fallbacks) ├─▶ LRCLIB      (lyrics, 5-step pipeline)
   ▼                                                                 ├─▶ iTunes      (artwork hi-res)
Prisma libSQL adapter ──▶ Turso (User·Favorite·Playlist·History·     └─▶ ChartLyrics (lyrics fallback)
                             PlaylistShare·Reaction·SyncQueue)
Service Worker: shell precache · static cache-first · API network-first · offline audio cache (Range-capable)
```

**43 API routes · ~27k lines of TypeScript.** Golden paths are browser-verified per day (desktop 1280px + mobile 390px); `bun run lint` and `tsc` are kept at zero errors.

## Dhun Pro — the honest tier

Everything labelled "Pro" is unlocked without payment:

1. **Instant** — one tap in Settings → Dhun Pro.
2. **Loyalty** — listen 25 tracks across 3 days → a personal `DHUN-XXXXX-XXXXXX` code is minted on-device (deterministic, offline-verifiable).
3. **Feedback** — send feedback (stored locally) → thank-you code.
4. **Code** — paste any valid Dhun code (checksum-verified, ambiguous-char-free alphabet).

There is no payment processor, no paywall server, no telemetry. The tier exists to separate *comfort* from *core* — and to prove a music platform can be free without dark patterns. See `PLAN-60.md` Phase G for the design rationale.

## Community

- **Contributing, codes of conduct, unlock codes for contributors:** see [COMMUNITY.md](COMMUNITY.md)
- **Performance budget & Lighthouse gate:** see [PERF-BUDGET.md](PERF-BUDGET.md)
- **The 60-day build log & plan:** see [PLAN-60.md](PLAN-60.md) · **Next quarter:** [PLAN-Q2.md](PLAN-Q2.md) · **Launch metrics:** [LAUNCH-REVIEW.md](LAUNCH-REVIEW.md)

## Roadmap

- [x] v1 — YouTube catalog, playlists/favorites/history, synced lyrics, EQ, PWA
- [x] v1.1 — offline audio caching, Audius multi-source, cloud sync (Turso), Chromecast
- [x] **60-day arc (Days 21–60)** — voice search, Copilot, AI DJ/NL search/playlist builder, charts, Waves, discovery, karaoke lyrics, artist pages, i18n (বাংলা), PWA excellence, storage manager, network dashboard, Dhun Pro tier, full regression pass + launch review
- [ ] Q2 — see [PLAN-Q2.md](PLAN-Q2.md)

License: MIT (code). Music playback depends on the respective platforms' free tiers; Dhun stores no media itself — audio is streamed or cached for personal offline listening.
