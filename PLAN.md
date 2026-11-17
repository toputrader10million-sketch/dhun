# 🎵 Dhun — প্রজেক্ট প্ল্যান (Implementation Plan v1)

> **"Dhun" (ধুন) = সুর** — আপনার সংগীত, আপনার নিয়মে। ইনস্টলেবল PWA, লগইন-মুক্ত, বিজ্ঞাপন-মুক্ত।

---

## ১. ভিশন ও স্কোপ (v1)

একটি **Progressive Web App** যা:
- YouTube-এর পুরো মিউজিক ক্যাটালগ ফ্রি API দিয়ে খোঁজে ও বাজায়
- YouTube Music free tier-এর প্রতিটি সুবিধা দেয় + তাদের নেই এমন ফিচারও (EQ, Sleep Timer, হাই-রেজ আর্ট, Visualizer)
- Android/iOS/Desktop — সবখানে ইনস্টলেবল, লকস্ক্রিন কন্ট্রোলসহ ব্যাকগ্রাউন্ড প্লে
- লগইন ছাড়াই ব্যক্তিগত লাইব্রেরি (favorites/playlists/history সার্ভার DB-তে)

**স্কোপ-আউট (v1):** ডাউনলোড, Chromecast, মাল্টি-ইউজার অ্যাকাউন্ট, পেমেন্ট — রোডম্যাপে আছে (REPORT.md §৬)।

---

## ২. সিস্টেম আর্কিটেকচার

```
┌────────────────────────────── ব্রাউজার (PWA) ─────────────────────────────┐
│  React UI (Home/Explore/Library/Now Playing/Settings)                    │
│  ── Zustand stores ──▶ Player Engine                                     │
│        ├─ YouTube IFrame API  (প্রাইমারি প্লেব্যাক, hidden audio-first)      │
│        ├─ HTMLAudio + Web Audio (Hi-Fi মোড: EQ, visualizer)               │
│        ├─ MediaSession bridge (লকস্ক্রিন/ব্যাকগ্রাউন্ড কন্ট্রোল)               │
│        └─ Service Worker (offline shell + static cache + installability) │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ fetch /api/* (relative)
┌──────────────────────────────────▼───────────────────────────────────────┐
│  Next.js API Routes (proxy + 10-30min memory cache + instance fallback)  │
│  /api/search /api/suggestions /api/home /api/radio/[id]                  │
│  /api/lyrics /api/artwork /api/streams/[id] /api/instances               │
│  /api/favorites /api/playlists(/[id]/items) /api/history                 │
└───────┬──────────────────┬──────────────────┬────────────────────────────┘
        │                  │                  │
   Piped API          LRCLIB API        iTunes API      SQLite (Prisma)
   (search/meta)      (synced lyrics)   (hi-res art)    (library DB)
```

**Playback Mode সিদ্ধান্ত গাছ:**
- `settings.playbackMode = "iframe"` (default) → IFrame engine
- `"hifi"` → সার্ভারে বেস্ট-এফোর্ট `/api/streams/[id]`; URL পেলে direct audio + Web Audio; 4s-এ ব্যর্থ → auto-fallback iframe (টোস্ট জানানো হয়)

---

## ৩. ডেটা কনট্র্যাক্ট (Frontend ⇄ Backend)

```ts
// শেয়ার্ড টাইপ — src/lib/types.ts
interface MusicItem {
  id: string            // YouTube videoId
  title: string
  artist: string        // চ্যানেল/শিল্পী
  artwork: string       // থাম্বনেইল (hqdefault প্রক্সি)
  duration: number      // সেকেন্ড
  views?: number
  album?: string; year?: string; genre?: string   // iTunes enrichment
}

GET /api/search?q&filter=music_songs|videos|albums|artists|playlists&page
  → { items: MusicItem[], nextPage?: string, filter }

GET /api/suggestions?q → { suggestions: string[] }   // (Piped param: query)

GET /api/home?region=IN → { sections: [{ title: string, items: MusicItem[] }] }
  // সার্ভার ৫টা কিউরেটেড music_songs সার্চ parallel চালায়, 30min cache

GET /api/radio/[id]?title&artist → { items: MusicItem[] }  // related = artist/title সার্চ − current

GET /api/lyrics?title&artist&duration → { synced?: string, plain?: string, source: string }
GET /api/artwork?title&artist → { url: string }      // iTunes 1000×1000
GET /api/instances → [{ name, url, ok, latencyMs }]
GET /api/streams/[id] → 200 { audioStreams: [...] } | 503 { error }  // বেস্ট-এফোর্ট Hi-Fi

GET/POST/DELETE /api/favorites            → Favorite[]
GET/POST/DELETE /api/playlists            → Playlist[] (with counts)
GET/PATCH/DELETE /api/playlists/[id]      → Playlist + items
POST/DELETE /api/playlists/[id]/items     → { ok }
GET/POST/DELETE /api/history              → HistoryEntry[] (max 200, dedupe by trackId)
```

**DB স্কিমা (Prisma/SQLite):** `Favorite(trackId unique)`, `Playlist→PlaylistItem[] (position)`, `HistoryEntry(playedAt index)` — প্রতিটিতে trackId/title/artist/artwork/duration snapshot (denormalized = দ্রুত রেন্ডার)।

---

## ৪. পেজ/ভিউ ডিজাইন (single-route SPA, mobile-first)

| ভিউ | বিষয়বস্তু |
|---|---|
| **Home** | টাইম-ভিত্তিক বাংলা গ্রিটিং ("শুভ সকাল/দুপুর..."), Quick Picks (হিস্ট্রি থেকে), ৫টা কিউরেটেড সেকশন (Bengali Hits, Bollywood Top, Global Hits, Chill Lo-fi, Punjabi Beats) — horizontal rows |
| **Explore** | সার্চ বার (suggestions dropdown, debounce), ফিল্টার চিপস (Songs/Videos/Albums/Artists/Playlists), রেজাল্ট লিস্ট/গ্রিড, Load more |
| **Library** | ট্যাব: Favorites (sortable list) / Playlists (cards + create dialog) / History |
| **Now Playing** | Full-screen vaul drawer: বড় আর্টওয়ার্ক (iTunes হাই-রেজ upgrade), blur bg, seek slider, shuffle/prev/play/next/repeat, ট্যাব: Up Next (queue, reorder) / Lyrics (synced হাইলাইট auto-scroll), Radio button, Sleep Timer |
| **Settings** | থিম (dark/light/system), Accent color, Region, Playback mode, 10-band EQ (Hi-Fi মোডে), Instance health-check, Install app, Cache clear, About |
| **Chrome** | Desktop: বাম sidebar + টপবার; Mobile: bottom nav; Mini-player সবার উপরে |

**কালার সিস্টেম:** ডার্ক ডিফল্ট (zinc-950), accent = rose (YT Music-এর রেড-এর আদব কিন্তু নিজস্ব), বিকল্প: amber/violet/emerald।

---

## ৫. বাস্তবায়ন ক্রম (Task Map)

| Task ID | কাজ | দায়িত্ব |
|---|---|---|
| 1 | API লাইভ ভেরিফিকেশন | ✅ সম্পন্ন |
| 2, 3 | PLAN.md, REPORT.md | ✅ সম্পন্ন |
| **4-a** | Backend: Prisma schema + ১২টা API route + cache/fallback lib | Subagent |
| 4-b | App icon (AI) + manifest + service worker + meta | Main |
| 4-c | IFrame engine + MediaSession + Zustand stores + AppShell | Main (4-a এর সমান্তরালে) |
| 5 | ৫টা ভিউ + প্লেয়ার কম্পোনেন্ট | Main |
| 6 | Integration + db push + lint + dev.log | Main |
| 7 | Agent Browser E2E ভেরিফিকেশন + ফিক্স | Main |
| 8 | ফাইনাল সামারি | Main |
| **v1.1-a** | Turso (libSQL adapter) + multi-user sync schema/API | ✅ Subagent 2-a |
| **v1.1-b** | Audius routes + /api/audio proxy + SW v4 audio cache + offline lib + Cast lib | ✅ Subagents 2-a/2-b |
| **v1.1-c** | UI wiring (source toggle, Offline tab, Cloud Sync card, cast/download buttons) | ✅ Main |
| **v1.1-d** | Vercel deploy prep (.env.example, README, prisma generate in build) | ✅ Main |
| **v1.1-e** | E2E: Audius playback+UI sync, offline download→offline play, sync card, responsive, footer | ✅ Main (SW v4 network-first dev fix + hifi timeupdate/hifiActive race fix) |

---

## ৬. কোয়ালিটি গেট (Definition of Done)

1. `bun run lint` — শূন্য error
2. Agent Browser: হোম রেন্ডার → সার্চ → গান প্লে (engine সাড়ে) → queue/next → লিরিক্স লোড → favorite save → playlist create → রিস্পনসিভ (mobile+desktop) চেক
3. dev.log-এ কোনো runtime error/failed API নেই
4. Lighthouse-friendly: manifest valid, SW registered, install prompt ক্যাপচার হয়
5. সব API graceful: Piped ডাউন থাকলে টোস্ট + UI বাঁচে

---

## ৭. ফাইল ম্যাপ (v1)

```
prisma/schema.prisma          # Favorite/Playlist/PlaylistItem/HistoryEntry
src/lib/types.ts, format.ts, piped.ts (instances+fetch+cache)
src/app/api/**                # উপরের ১২ route
src/engine/youtube.ts         # IFrame loader+controller (singleton)
src/engine/media-session.ts   # metadata + action handlers
src/store/player.ts, settings.ts, ui.ts   # Zustand (persist)
src/components/app-shell.tsx  # sidebar/bottom-nav/topbar
src/components/player/{mini-player,now-playing,queue-list,lyrics-panel}.tsx
src/views/{home,explore,library,settings}-view.tsx
src/components/pwa/register-sw.tsx, install-button.tsx
public/{manifest.webmanifest,sw.js,icons/*}
src/app/{layout,page}.tsx     # metadata + SPA mount
```
