# Dhun — Real-device test matrix (Q2.6)

All 60 PLAN-60 days were verified headless/desktop. This matrix is the honest
boundary between **what automation covers** and **what only a real phone can
prove**. Before each release candidate, run the `[manual]` rows on one Android
(Chrome) and one iPhone (Safari). Everything else is already browser-verified
in CI-style E2E passes.

Legend: ✅ automated headless · 🔍 `[manual]` real-device only · ⚠️ known honest gap

## 1. Install & PWA

| Feature | Android Chrome | iOS Safari | Automation |
|---|---|---|---|
| Manifest + icons + theme | ✅ | ✅ | served + parsed headless |
| Custom install sheet (`beforeinstallprompt`) | ✅ | ⚠️ iOS shows the honest Add-to-Home-Screen guide instead (no prompt event exists) | headless synthetic prompt |
| Shortcuts (Search / Charts / Library / Trending) | 🔍 `[manual]` long-press launcher icon | 🔍 `[manual]` touch-and-hold app icon | manifest parsed |
| `share_target` (share into Dhun → pre-filled search) | 🔍 `[manual]` share any URL from another app | ⚠️ iOS has no share_target; use copy-paste | manifest parsed |
| `web+dhuun://play/yt/<id>` protocol link | 🔍 `[manual]` open from a QR/notes app | ⚠️ Safari custom schemes differ | `/api/oembed` deep-link headless |
| Offline cold-start (airplane mode → app opens with shell) | 🔍 `[manual]` | 🔍 `[manual]` | SW precache verified headless |

## 2. Playback & MediaSession

| Feature | Android Chrome | iOS Safari | Automation |
|---|---|---|---|
| Audius/Jamendo Hi-Fi playback (direct audio element) | ✅ | ✅ | headless E2E |
| YouTube embed playback (visible bubble) | ✅ | ✅ | headless (bot-check limited) |
| Lockscreen notification: title / artist / artwork | 🔍 `[manual]` | 🔍 `[manual]` — with the screen locked, media must show Dhun metadata | metadata + size ladder verified headless |
| Lockscreen play / pause / next / prev | 🔍 `[manual]` | 🔍 `[manual]` | handlers registered headless |
| Lockscreen scrubber (`seekto`) + ±10 s (`seekforward/backward`) | 🔍 `[manual]` | 🔍 `[manual]` | handlers registered; `seekBy` wired headless |
| Bluetooth / car AVRCP: next/prev/seek from steering controls | 🔍 `[manual]` | 🔍 `[manual]` | same MediaSession surface |
| Background audio continuity (Audius track, screen off) | 🔍 `[manual]` | 🔍 `[manual]` | n/a headless |
| **YouTube tracks in background** | 🔍 `[manual]` — iframe keeps playing while app is backgrounded | ⚠️ **honest gap**: Safari suspends iframes when hidden; YouTube tracks pause. Audius/Jamendo keep playing; the app shows a one-time notice and offline downloads are the workaround | n/a headless |
| Cast handoff | 🔍 `[manual]` same-Wi-Fi device | 🔍 `[manual]` | session lifecycle headless |

## 3. Visual & layout (safe areas)

| Feature | Android Chrome | iOS Safari | Automation |
|---|---|---|---|
| Notch/status bar (standalone, `viewportFit=cover`) | 🔍 `[manual]` | 🔍 `[manual]` — header must clear the notch; home-indicator must not cover the tab bar | `pt-[max(0.75rem,env(safe-area-inset-top))]` + `pb-safe` shipped; 390/768/1280 headless |
| Keyboard behavior (Copilot composer) | 🔍 `[manual]` — `interactiveWidget=resizes-content` keeps the composer above the keyboard | 🔍 `[manual]` — Safari resizes visual viewport; composer must stay reachable | headless keyboard simulation limited |
| Drawer drag (Now Playing, Copilot) via touch | 🔍 `[manual]` | 🔍 `[manual]` — Vaul drag-to-close inertia | click open/close headless |
| Scroll + touch targets ≥44 px | 🔍 `[manual]` thumb reach | 🔍 `[manual]` | 390 px layout headless |

## 4. Data saver (Q2.9)

| Feature | How to verify |
|---|---|
| Manual toggle → 128 kbps cap | Settings → Playback → Data saver → ON; play a YouTube track in Hi-Fi: resolver picks ≤128 kbps stream; offline download of a yt track requests `?maxBitrate=128` |
| Follow-device mode | Android Chrome: enable Lite/Data Saver or DevTools `Network → Throttling` + `navigator.connection.saveData = true` override → card shows "Device Data Saver detected" + toast once |
| Artwork tiers | With saver on: feeds load `mqdefault`, hi-res iTunes upgrade is skipped, Now Playing backdrop loads the small tier |
| Honest limits | Audius/Jamendo proxies expose no bitrate selector (card says so); Safari/Firefox do not report `saveData` (follow-device stays idle, card says so) |

## 5. Release checklist (10 minutes on each real phone)

1. Install via the install sheet (Android) / Add to Home Screen (iOS).
2. Launch standalone → home feed renders, no notch overlap.
3. Play an Audius track → lockscreen shows artwork + controls; screen off → audio continues.
4. Lock screen scrubber: drag to seek; ±10 s buttons work.
5. Background the app → YouTube track behavior matches Section 2 (honest gap on iOS).
6. Share a URL into Dhun (Android) → search pre-filled.
7. Airplane mode → app shell opens, offline downloads play, honest empty states elsewhere.
8. Settings → Data saver ON → play + download → smaller artwork, capped requests.
