# Community Notes

Dhun is built in public as a 60-day arc, and it stays open after that. This file is the community handbook: how to run your own, how to contribute, and how the unusual bits (Pro codes, honesty rules) work.

## TL;DR

- **No accounts, no ads, no tracking, no payments** — by design, and by policy. Don't submit features that add any of these.
- **Core music features stay free and ungated.** Dhun Pro is a *comfort* layer only; it must never gate playback, search, library, lyrics, offline, sync, or the Bangla UI.
- **Honesty is a feature.** If the app can't do something, it says so. Faked loaders, fake data (e.g. visualizer bars without a real FFT), or misleading toasts are treated as bugs.

## Run your own

```bash
bun install
cp .env.example .env
bun run db:push
bun run dev
```

See [README.md](README.md) → "Deploy to Vercel + Turso" for the full cloud setup (free tiers only). Local SQLite works with zero configuration; missing tables are bootstrapped idempotently on first request when you point Prisma at Turso.

## Contributing

1. Fork / branch from `main`.
2. Keep the quality gates green — they're the same ones every one of the 60 days passed:
   - `bun run lint` — zero errors
   - `bunx tsc --noEmit` — zero errors in `src/`
   - Browser E2E of whatever you changed (desktop + mobile viewport)
   - `dev.log` free of runtime errors
3. Mobile-first, responsive, reduced-motion-aware. Reuse shadcn/ui primitives and the existing store patterns before adding new ones.
4. PRs: describe the *user-visible* behavior change, and include screenshots for UI work.

### Code house rules

- **APIs:** free/public only (Piped, Audius, LRCLIB, iTunes, ChartLyrics, Open-Meteo). No keyed proprietary APIs in the core paths.
- **Privacy:** anonymous by default. Community reactions (`Reaction` model) deliberately carry no user id, IP or cookie — keep it that way.
- **Caching:** every upstream call gets a memory cache with a sane TTL; identical AI requests must answer instantly.
- **i18n:** user-facing strings go through `useT()`; new features ship with both English and বাংলা keys (`src/lib/i18n-bn.ts`). Server-generated AI prose may stay English (documented gap).
- **Honest states:** empty states use the shared `EmptyState` component; playback limitations get specific toasts, never silence.

## Dhun Pro unlock codes (for contributors & testers)

Pro unlock codes are minted and verified **offline** with a djb2 checksum over an ambiguous-char-free alphabet: `DHUN-XXXXX-XXXXXX`. There is no server, no payment, no expiration.

- Loyalty codes are deterministic from a device seed after 25 plays across 3 days — the same device always mints the same code.
- Contributors and testers can share codes freely; a code only flips a local feature flag (`proVia`, `proSince`), nothing more.
- To regenerate/reset: Settings → Dhun Pro → deactivate. All Pro state is local.

## Community data (what we collect)

Almost nothing, on purpose:

| Data | Where | Identity |
|---|---|---|
| Favorites, playlists, history | Your sync-code user row in Turso (optional; local-first without sync) | 8-char code only — no email, no password |
| "Loved" reactions (Charts → Loved) | Aggregate 30-day counters | No user id, no IP, no cookie |
| Everything else | Your device (localStorage / IndexedDB) | — |

## Reporting issues

Open a GitHub issue with: what you did, what you expected, what happened. For playback problems, include the source badge shown in Now Playing (YouTube embed / Hi-Fi Audius / offline) — most "broken playback" reports are one of:

1. The track disallows embedding (Dhun skips honestly to the next track),
2. A Piped instance is down (Settings → Network shows live health; auto-failover exists),
3. Lyrics genuinely don't exist in LRCLIB/ChartLyrics yet (the panel says so).

## Roadmap input

The next quarter's plan lives in [PLAN-Q2.md](PLAN-Q2.md). Weight your feature requests by the house rules above — "free, honest, private" beats "shiny" every time.
