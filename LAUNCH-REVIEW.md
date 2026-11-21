# Dhun — 60-Day Launch Review

**Arc:** Days 1–60 of PLAN-60 · all 60 days shipped and browser-verified · production: https://dhun-gamma-wheat.vercel.app

This document is the honest end-of-arc review: what shipped, what the numbers say, what broke and got fixed, and where the next quarter goes. See [PLAN-Q2.md](PLAN-Q2.md) for the forward plan.

---

## 1. What shipped (six phases, 60 days)

| Phase | Days | Theme | Shipped |
|---|---|---|---|
| A | 1–10 | Foundation repair + premium feel | Offline/download repair (SW v5 precache, offline-safe seek, client-assisted resolve), gradient/glass visual system, a11y + keyboard, 6-theme engine + accent designer, crossfade/gapless, per-source EQ |
| B | 11–20 | Listening intelligence | Sleep timer pro, karaoke lyrics, share-card canvas, region charts, AI DJ daily mix, natural-language search, smart radio, auto-mix, AI playlist builder, smart home (time + weather feed) |
| C | 21–32 | Input & control depth | Voice search (Web Speech), Dhun Copilot (catalog-aware chat), smart downloads (network-aware), EQ profiles per source, 3 visualizer modes, playlist import/export (DHUN1 codes), sync conflict rules, artist pages + discography, desktop widget, cast polish + queue handoff |
| D/E | 33–42 | Social + editorial | Public share-links (Turso-backed), genre×region charts, Waves editorial, anonymous community reactions + Loved chart, discovery feed, lyrics expansion (LRCLIB 5-step + ChartLyrics), onboarding tour, unified empty states |
| F | 43–50 | Platform depth | i18n engine + full বাংলা (~425→494 keys), PWA shortcuts/share-target/protocol handler, custom install sheet (iOS guide), performance budget card, storage manager (quota + LRU auto-evict), instance latency graphs |
| G | 51–57 | Dhun Pro tier | Feature-flag system, honest upsell sheets, 4 unlock paths (instant/loyalty/feedback/code — offline checksum codes), Imperial Gold theme + crown signature, Pro panel with usage dashboard, premium About landing, full polish sweep |
| H | 58–60 | Launch & hardening | Full golden-path regression (2 real bugs + 1 production bug found & fixed), docs (README/COMMUNITY), this review + Q2 plan |

## 2. The numbers

| Metric | Value |
|---|---|
| TypeScript source | ~26,700 lines across `src/` |
| API routes | 43 (`/api/*` — catalogs, sync, AI, share, reactions, weather, charts…) |
| React components | 74 (player, premium, pwa, settings, copilot + 20 shadcn/ui primitives) |
| Views | 8 (home, explore, charts, library, network, settings, artist, shared playlist) |
| Zustand stores | 6 (player, library, offline, settings, cast, ui) |
| Bangla i18n keys | 494 |
| Upstream APIs consumed | 6 free/public — Piped, Audius, LRCLIB, ChartLyrics, iTunes, Open-Meteo |
| Payments/tracking/ad-tech | **0** |
| Days shipped on schedule | 60/60 |

## 3. Honest defect log (what broke, what fixed it)

The daily browser-E2E gate caught these — the ones that slipped past got caught by the Day 58 full regression:

1. **Day 1** — offline playback broke after shell precache v3; fixed with SW v5 shell precache + offline-safe seek (206 slicing).
2. **Days 2–10** — YouTube stream extraction blocked from datacenter IPs; responded honestly: official IFrame embed as primary + Audius/Jamendo guaranteed direct-stream paths + client-assisted resolve. This remains the honest architectural answer (see Risks below).
3. **Day 21-a** — the `xs:` Tailwind breakpoint was never defined → mini-player Previous button invisible on all screens; added `--breakpoint-xs: 30rem` and verified at 520px.
4. **Day 30** — legacy TypeScript errors (10) surfaced and fixed during Copilot work.
5. **Day 32** — mini-player read a nonexistent cast store field (`castTrackId` vs `trackId`) → cast icon never highlighted; fixed.
6. **Day 34** — production Turso lacked new tables; introduced lazy idempotent DDL bootstrap (`db-bootstrap.ts`) so fresh cloud databases self-heal on first request.
7. **Day 57** — `useProAction` wrapper double-invocation bug; Radix dialog form reset on unmount.
8. **Day 58 — regression harvest (3 real bugs):**
   - **Ghost favorites** (data integrity): favorites DELETE defaulted `source='yt'` → Audius favorites could never be removed server-side and resurrected on every library load. Fixed client + server (cross-source delete, `removed` count).
   - **Stale heart UI**: two components subscribed a stable *function* selector (`isFavorite`) that never re-renders on data change → hearts froze while paused. Both now subscribe the favorites array directly.
   - **Production 500** on `/api/sync/queue`: the D32 `QueueHandoff` table was missing from Turso (predates the D34 lazy bootstrap). Added to bootstrap; routes self-heal with an honest 503 while warming.

## 4. Quality gates — final status

- `bun run lint` — **0 errors**
- `bunx tsc --noEmit` — **0 errors** in `src/` (scaffold `examples/`/`skills/` excluded)
- Browser E2E golden paths — verified desktop 1280px + mobile 390px, every day of the arc
- `dev.log` runtime errors — 0
- Performance budget card (TTFB/FCP/LCP/JS transfer) — pass on production (measured Day 50: TTFB ~51ms, FCP ~280ms)
- Lighthouse gate (90+) — procedure documented in [PERF-BUDGET.md](PERF-BUDGET.md)

## 5. Known limits (stated honestly, not hidden)

- **YouTube download/extraction**: blocked from datacenter IPs by design (2025+). Dhun's answer is architectural: official embed playback (always works), Audius/Jamendo direct streams (EQ/visualizer/offline-grade), client-assisted resolution for downloads where the browser's own network can reach media endpoints. Per-track honest skip toasts when embedding is disallowed.
- **Server-generated AI prose** (Copilot chat, AI section titles) stays English even in বাংলা UI — documented i18n gap.
- **Anonymous by design**: no accounts, no emails; cloud sync is via 8-char codes. This limits "sign-in with…" style features permanently — accepted trade.
- **Piped instance churn**: community instances come and go; the Network dashboard + health-check + auto-failover handle it, but search latency depends on volunteer infrastructure.

## 6. What we'd do differently

1. The favorites source-mismatch bug class (silent no-op deletes that return 200) argues for **integrity assertions in API responses** — `removed` counters now exist; earlier routes should grow them too.
2. Zustand **stable-function selectors** (`s.someAction` then calling it with data) caused one invisible-stale-UI bug class; subscribe to data, derive locally.
3. The lazy-bootstrap table list should be **generated from schema.prisma**, not hand-curated — Day 58's production 500 was exactly this hand-curation gap.

## 7. Verdict

Dhun ships as a complete, free, honest music platform: 60 planned days, 60 shipped days, zero payments, zero tracking, two UI languages, six upstream APIs, and a regression harness that caught real production bugs on its very first full pass. The next quarter's plan ([PLAN-Q2.md](PLAN-Q2.md)) focuses on resilience, social depth, and the first real-device feedback loop.
