# Dhun — PLAN-Q2 (Next Quarter Roadmap)

The 60-day arc (PLAN-60) is complete — see [LAUNCH-REVIEW.md](LAUNCH-REVIEW.md). Q2 keeps the house rules: **free, honest, private** — core features ungated, no accounts, no ads, no tracking, no payments.

Theme for the quarter: **from "works everywhere" to "works everywhere, for everyone"** — resilience, real-device feedback, social depth, and contributor experience.

---

## Phase Q1 — Resilience & Ops (weeks 1–3)

| # | Item | Why |
|---|---|---|
| 1 | **Schema-driven lazy bootstrap** — generate `db-bootstrap.ts` DDL from `prisma/schema.prisma` at build time | The D58 production 500 was a hand-curated table list. Generation removes the whole bug class. |
| 2 | **API integrity counters everywhere** — `removed`/`matched` counts on all mutating routes, surfaced in toasts | Silent no-op deletes (the ghost-favorites bug) must be impossible to reintroduce. |
| 3 | **Upstream circuit breakers** — per-API failure streaks open a breaker, serve cached/stale data with an honest banner | Piped instance churn is the #1 runtime risk; today we fail over, tomorrow we should degrade gracefully. |
| 4 | **Uptime beacon + self-host health page** — optional `/api/health` with instance map, AI status, cache hit-rates | Operators running self-hosted instances need one honest place to look. |
| 5 | **Structured error envelopes** — consistent `{ error, code, retryable }` across all 43 routes | Client can distinguish retryable vs fatal; toasts get precise. |

## Phase Q2 — Real-device loop (weeks 4–6)

| # | Item | Why |
|---|---|---|
| 6 | **Real-device test matrix** — Android Chrome, iOS Safari (PWA install, share-target, MediaSession, safe areas) | All 60 days were headless/desktop-verified; iOS quirks (Vaul drawers, audio focus, add-to-home) deserve a dedicated pass. |
| 7 | **iOS audio session polish** — lockscreen artwork, Now Playing bar, background audio continuity | The honest gap: iOS Safari limits background audio for embeds; Audius Hi-Fi path should own iOS playback. |
| 8 | **Bluetooth/car intent handling** — MediaSession metadata + next/prev wiring for steering controls | Low effort, high delight for the daily-listener cohort. |
| 9 | **Data saver mode** — stream cap (128kbps), artwork lazy tiers, feed image thresholds | Complements saveData detection that already exists in smart downloads. |

## Phase Q3 — Social depth, still anonymous (weeks 7–9)

| # | Item | Why |
|---|---|---|
| 10 | **Shared listening rooms** — ephemeral rooms (no accounts): invite code, synced queue, everyone's reaction emojis | Builds on Reaction + queue handoff plumbing; anonymity preserved via device labels. |
| 11 | **Waves contributions** — community-submitted curated lists (moderated, share-code based) | Waves are editor-written today; the share-code pipeline (DHUN1) already exists. |
| 12 | **Loved chart expansion** — per-region Loved, weekly delta ("up 3") | The anonymous reaction store already aggregates 30-day tops. |
| 13 | **Playlist collab via share-codes** — two devices append to one playlist through a merge-code exchange | Conflict rules (D28) already define merge semantics. |

## Phase Q4 — Contributor & content experience (weeks 10–12)

| # | Item | Why |
|---|---|---|
| 14 | **Instance registry UI** — add/health-check custom Piped/Audius gateways from Settings (currently file-level) | Self-hosters and privacy users want to pin their own instances. |
| 15 | **Plugin-friendly AI tools** — Copilot tool schema (play/search/queue/theme) so contributors can add skills without touching the core | Copilot already has APP_FACTS + catalog queries; formalize it. |
| 16 | **বাংলা prose polish + 3rd language slot** — finish AI-prose localization hooks, add one more locale (Hindi candidate) | i18n engine is dependency-free; the hard part (dual-language discipline) is proven. |
| 17 | **Onboarding v2** — tour reflects Pro + weather + voice features with live demos | The 3-step tour predates Phases F/G features. |
| 18 | **Export everything** — one-click full-library JSON backup/restore (favorites+playlists+history+settings) | Local-first promise: users should be able to leave with everything, always. |

---

## Non-goals (unchanged)

- No accounts, emails, or sign-in walls
- No ads, sponsored placements, or affiliate anything
- No payment tiers — Dhun Pro stays a free comfort layer
- No proprietary/keyed APIs in core paths
- No fake data anywhere (visualizers, loaders, stats)

## Success metrics for Q2

1. Production 5xx rate ≈ 0 across all 43 routes (after schema-driven bootstrap)
2. Real-device pass: install + offline playback + lockscreen controls on iOS + Android
3. One community-contributed Wave and one community-contributed Copilot skill
4. i18n: ≥ 3 locales with complete chrome coverage
5. Zero regressions shipped: every day keeps the golden-path E2E gate green
