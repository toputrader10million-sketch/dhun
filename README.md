# Dhun (ধুন) — Free Music PWA

> Your music, your rules. Installable PWA • YouTube catalog + Audius indie streams • offline downloads • cloud sync • Chromecast • no ads, no tracking.

Dhun is a production-ready progressive web app music player that mirrors YouTube Music's core experience — and goes beyond it with features the big platforms don't give away: 10-band EQ, sleep timer, synced lyrics, hi-res artwork, device-level offline caching, multi-device library sync and Chromecast, all on 100% free public APIs.

---

## Feature matrix

| Feature | Source | Notes |
|---|---|---|
| Search / home feed / radio | Piped API (free, community) | Multi-instance fallback + memory cache |
| Playback | YouTube IFrame (official embed) | Always available, audio-first |
| Hi-Fi playback | `/api/audio/[id]` same-origin proxy | Web Audio graph → 10-band EQ, visualizer |
| Indie catalog | **Audius API** (free) | Trending on Home + YouTube↔Audius search toggle |
| Lyrics | LRCLIB | Synced, auto-scroll highlight |
| Artwork | iTunes Search | Up to 1000×1000 hi-res upgrade |
| Offline downloads | Service Worker + Cache API + IndexedDB | Per-track download with progress, plays with zero network |
| Cloud sync | **Turso (libSQL)** via Prisma driver adapter | 8-char sync code links any device; export/import JSON backup |
| Chromecast | Cast Web SDK | Default media receiver, remote transport + volume |
| PWA | manifest + Service Worker v3 | Install prompt, offline shell, lockscreen MediaSession |

## Tech stack

Next.js 16 (App Router) • TypeScript • Tailwind CSS 4 + shadcn/ui • Zustand • Prisma + SQLite/Turso (libSQL) • PWA (Service Worker, Cache Storage, IndexedDB)

---

## Quick start (local)

```bash
bun install
cp .env.example .env         # local SQLite works with zero config
bun run db:push              # create local schema
bun run dev                  # http://localhost:3000
```

## Deploy to Vercel + Turso (free tier friendly)

### 1. Push to GitHub

```bash
cd /path/to/project
git add .
git commit -m "Dhun v1.1 — offline, Audius, sync, cast"
git remote add origin git@github.com:<you>/dhun.git   # or https URL
git push -u origin main
```

### 2. Create the Turso database (already done if you have a URL+token)

```bash
turso db create music-player
turso db show music-player --url        # → TURSO_DATABASE_URL
turso db tokens create music-player     # → TURSO_AUTH_TOKEN
```

### 3. Push the Prisma schema to Turso (one-time)

```bash
# Prisma CLI doesn't accept libsql:// directly, so apply generated SQL:
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > schema.sql
# then execute schema.sql against Turso (any libSQL client, e.g.):
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

Add the following Environment Variables (Production + Preview):

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://music-player-<id>.aws-ap-south-1.turso.io` |
| `TURSO_AUTH_TOKEN` | your Turso token |

That's it — when both vars are present the app automatically uses Turso through the Prisma libSQL driver adapter (`src/lib/db.ts`). No other keys needed.

### 5. Verify

- App loads, Home shows curated sections + Audius Trending.
- Settings → Cloud Sync shows a sync code; enter that code on another device → library follows.
- Player: ⋮ menu → "Download for offline" → airplane mode → track still plays.

> **Security:** the Turso token is only ever set as a Vercel env var — never commit it. If a token leaks, rotate it with `turso db tokens create music-player`.

## Architecture snapshot

```
Browser (PWA) ── fetch /api/* ──▶ Next.js route handlers (memory cache + instance fallback)
   │  engines: IFrame ▸ Hi-Fi proxy ▸ offline Cache ▸ Cast remote      │
   │  stores:  player / library / offline / settings / cast            ├─▶ Piped API   (search/meta)
   │  sync:    dhun_uid cookie → User.code (8-char)                    ├─▶ Audius API  (trending/search/stream)
   ▼                                                                   ├─▶ LRCLIB      (lyrics)
Prisma libSQL adapter ──▶ Turso (User·Favorite·Playlist·History)        └─▶ iTunes      (artwork)
Service Worker v3: shell precache · static cache-first · API network-first · audio offline cache (dhun-v3-audio)
```

## Roadmap

- [x] v1 — YouTube catalog, playlists/favorites/history, synced lyrics, EQ, PWA
- [x] v1.1 — offline audio caching, Audius multi-source, cloud sync (Turso), Chromecast
- [ ] v1.2 — gaps (recommendations), cross-device queue handoff, iOS install polish
- [ ] v1.3 — federated Piped instance health map, per-track cache quality selector

License: MIT (code). Music playback depends on the respective platforms' free tiers; Dhun stores no media itself — audio is streamed or cached for personal offline listening.
