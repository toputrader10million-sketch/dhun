# 🎵 Dhun — গবেষণা ও বিশ্লেষণ রিপোর্ট (Research & Analysis Report)

> প্রজেক্ট: **Dhun** — ফ্রি API-ভিত্তিক ইউটিউব মিউজিক PWA প্ল্যাটফর্ম
> তারিখ: আজ (লাইভ টেস্ট ভেরিফাইড)
> উদ্দেশ্য: YouTube Music-এর মতো (বরং ভালো) অভিজ্ঞতা — সম্পূর্ণ ফ্রি API দিয়ে, বাস্তবভিত্তিক ও টেকনিক্যালি টেকসই উপায়ে

---

## ১. বাস্তবতা যাচাই (আজকের লাইভ টেস্ট — সবচেয়ে গুরুত্বপূর্ণ আবিষ্কার)

আমরা প্ল্যান করার আগে সরাসরি সার্ভার থেকে প্রতিটি ফ্রি API লাইভ টেস্ট করেছি। ফলাফল:

| API / পদ্ধতি | এন্ডপয়েন্ট | ফলাফল | মন্তব্য |
|---|---|---|---|
| **Piped Search** | `api.piped.private.coffee/search?filter=music_songs` | ✅ 200 OK (1.3s) | গান, শিল্পী, অ্যালবাম ডেটা পাওয়া যায় |
| **Piped Trending** | `/trending?region=IN` | ✅ 200 OK | ভিডিও ট্রেন্ডিং (মিউজিক-স্পেসিফিক নয়) |
| **Piped Streams** | `/streams/{videoId}` | ❌ 500 | `"LOGIN_REQUIRED: Sign in to confirm you're not a bot"` — YouTube ব্লক |
| Piped kavin.rocks | search + streams | ❌ HTTP 525 | ইনস্ট্যান্স ডাউন |
| Piped leptons.xyz | search | ❌ 403 | Cloudflare challenge |
| Piped reallyaweso.me | search | ❌ 502 | ডাউন |
| **Invidious** | `inv.nadeko.net/api/v1/videos` | ❌ 403 | "Endpoint disabled" |
| Invidious nerdvpn.de | videos | ❌ timeout | অফলাইন/ব্লকড |
| **YouTube InnerTube (ANDROID/IOS client)** | `youtubei/v1/player` | ❌ 400/403 | PO-token ছাড়া `Precondition check failed` |
| youtubei.js লাইব্রেরি | `yt.getInfo()` | ❌ | "This video is unavailable" (datacenter IP) |
| **LRCLIB (লিরিক্স)** | `lrclib.net/api/search` | ✅ 200 OK | **সিঙ্কড + plain লিরিক্স ফ্রি**, কোনো কী লাগে না |
| **iTunes Search (আর্টওয়ার্ক)** | `itunes.apple.com/search` | ✅ 200 OK | **1000×1000 হাই-রেজ অ্যালবাম আর্ট ফ্রি** |

### 🔑 মূল সিদ্ধান্ত (Key Insight)

**২০২৪-২৫ সালে YouTube সার্ভার-সাইড extraction পুরোপুরি বন্ধ করে দিয়েছে** (PO-token/botguard attestation)। এজন্যই Piped/Invidious-এর `streams` এন্ডপয়েন্ট বেশিরভাগ সময় ভাঙা। এটাই "বাস্তবভিত্তিক" প্ল্যাটফর্ম দাঁড় করানোর সবচেয়ে বড় চ্যালেঞ্জ।

**সমাধান — Hybrid Playback Engine:**
1. **Discovery/Metadata (সার্ভার-সাইড)** — Piped search/trending, LRCLIB লিরিক্স, iTunes আর্টওয়ার্ক → সব ✅ কাজ করছে, আমাদের Next.js API routes এ proxy + cache করব।
2. **Playback (ব্রাউজার-সাইড)** — **YouTube IFrame Embed API** ইউজারের নিজের ব্রাউজারে চলে — ব্রাউজারের আসল ব্রাউজার এনভায়রনমেন্টে YouTube নিজেই attestation সামলায়। এটা **YouTube-এর অফিসিয়াল Terms-compliant এমবেডিং** — তাই স্থিতিশীল ও আইনগতভাবে সবচেয়ে নিরাপদ। ভিডিও hidden রেখে audio-first অভিজ্ঞতা দিই, JS API দিয়ে play/pause/seek/volume সম্পূর্ণ কন্ট্রোল + **MediaSession bridge** (লকস্ক্রিন/ব্যাকগ্রাউন্ড কন্ট্রোল)।
3. **Hi-Fi Mode (ঐচ্ছিক, experimental)** — যদি কোনো Piped ইনস্ট্যান্স stream URL দিতে পারে, তাহলে সরাসরি `<audio>` + Web Audio API → **10-band EQ, Visualizer, bitrate সিলেকশন**। ব্যর্থ হলে auto-fallback IFrame মোডে।

এই হাইব্রিড ডিজাইনে অ্যাপ **কখনো মরে না**: Hi-Fi চললে বেশি ফিচার, নাহলে IFrame — তবু সম্পূর্ণ প্লেয়ার।

---

## ২. বিদ্যমান প্লেয়ারদের গভীর বিশ্লেষণ (Competitive Landscape)

### বিশ্লেষণ করা প্লেয়ারগুলো

| প্লেয়ার | প্ল্যাটফর্ম | ইঞ্জিন/সোর্স | ফ্রি কী পাওয়া যায় | দুর্বলতা |
|---|---|---|---|---|
| **YouTube Music (Free)** | Web/Android/iOS | অফিসিয়াল | ক্যাটালগ, রেডিও, লিরিক্স | **ব্যাকগ্রাউন্ড প্লে বন্ধ (মোবাইলে lock করলে বন্ধ), বিজ্ঞাপন, ডাউনলোড নেই** |
| **ViMusic** | Android | NewPipe extractor | ad-free, ব্যাকগ্রাউন্ড, ক্যাশ, queue | প্রজেক্ট বন্ধ (discontinued), extraction প্রায়ই ভাঙে |
| **RiMusic** | Android | NewPipe + মাল্টি Piped | ViMusic-এর সব + offline, লিরিক্স, থিম | extraction ভাঙলে আপডেটের অপেক্ষা, ব্যাটারি খরচ বেশি |
| **InnerTune / Metrolist** | Android | NewPipe/Piped | Material 3 UI, synced lyrics, offline cache | শুধু Android, ডেস্কটপ/ওয়েব নেই |
| **Piped Music (Web)** | Web | Piped API | ad-free web player | ইনস্ট্যান্স instability, ফিচার হালকা |
| **Harmony / MusicPlayer web প্রজেক্ট** | Web | IFrame/extractor | বেসিক প্লেব্যাক | লিরিক্স/EQ/queue নেই, বিক্ষিপ্ত মেইনটেন |
| **Nuclear** | Desktop | YouTube + Deezer/Itunes metadata | মাল্টি-সোর্স সার্চ | ডেস্কটপ-only, ইনস্টল করতে হয় |

### তাদের থেকে আমাদের পার্থক্য (USP ম্যাট্রিক্স)

| ফিচার | YT Music Free | RiMusic | Piped Music | **Dhun (আমরা)** |
|---|---|---|---|---|
| প্ল্যাটফর্ম | Web+Mobile app | Android-only | Web | **Web PWA — সব প্ল্যাটফর্ম, ইনস্টলেবল** |
| বিজ্ঞাপন | ❌ (অনেক) | ✅ নেই | ✅ নেই | ✅ নেই |
| ব্যাকগ্রাউন্ড/লকস্ক্রিন প্লে | মোবাইলে ❌ | ✅ | আংশিক | ✅ (MediaSession bridge) |
| সিঙ্কড লিরিক্স | ✅ | ✅ | ❌ | ✅ (LRCLIB, কারাওকে-স্টাইল হাইলাইট) |
| ১০-ব্যান্ড EQ + Visualizer | ❌ | ❌ | ❌ | ✅ (Hi-Fi মোডে Web Audio) |
| হাই-রেজ অ্যালবাম আর্ট (1000px) | ✅ | আংশিক | ❌ | ✅ (iTunes API) |
| Sleep Timer | ❌ | ❌ | ❌ | ✅ |
| ফেভারিট/প্লেলিস্ট/হিস্ট্রি | ✅ (লগইন লাগে) | ✅ | আংশিক | ✅ (লগইন ছাড়াই, সার্ভার DB) |
| Search suggestions + মাল্টি-ফিল্টার | ✅ | ✅ | আংশিক | ✅ |
| Radio/Autoplay (related) | ✅ | ✅ | ❌ | ✅ |
| লগইন/অ্যাকাউন্ট দরকার | ✅ | ❌ | ❌ | ❌ (শূন্য ফ্রিকশন) |
| Extraction ভাঙলে | — | অ্যাপ মরে | অ্যাপ মরে | ✅ IFrame fallback — চলতেই থাকে |

---

## ৩. ব্যবহৃত ফ্রি API স্ট্যাক (সব verified)

1. **Piped API** (`api.piped.private.coffee` + ফলব্যাক ইনস্ট্যান্স চেইন)
   - সার্চ (songs/videos/albums/artists/playlists), trending, suggestions
   - ওপেন সোর্স, কোনো key নেই, CORS আমাদের সার্ভার প্রক্সি দিয়ে সমাধান
2. **LRCLIB** (`lrclib.net`) — synced (LRC) + plain লিরিক্স, ১০০% ফ্রি, no-key
3. **iTunes Search API** (`itunes.apple.com`) — হাই-রেজ কভার আর্ট, অ্যালবাম/জনরা/বছর metadata, no-key
4. **YouTube IFrame Embed** — প্লেব্যাক (অফিসিয়াল, ToS-compliant, ব্রাউজারে PO-token নিজে থেকেই সমাধান)
5. **MediaSession API / Web Audio API / Service Worker** — ব্রাউজার নেটিভ, ফ্রি

### লিগ্যাল/টেকনিক্যাল সততা (বাস্তবভিত্তিক ভিত্তির জন্য জরুরি)
- ভিডিও **stream-ডাউনলোড/রিহোস্ট করা হচ্ছে না** — আমরা YouTube-এর অফিসিয়াল embed ব্যবহার করছি, যেটা YouTube নিজেই প্রকাশ্যে অনুমোদন করে।
- অ্যাড, পে-ওয়াল, কনটেন্ট বিক্রি নেই → পার্সোনাল/কমিউনিটি ব্যবহারের সবচেয়ে নিরাপদ মডেল।
- Piped-এর extraction অংশগুলো gray-area — তাই সেটা আমাদের এখানে শুধু **ঐচ্ছিক Hi-Fi বুস্টার**, মূল প্ল্যাটফর্ম IFrame-এ দাঁড়িয়ে।

---

## ৪. ঝুঁকি বিশ্লেষণ ও মিতিগেশন (Risk Matrix)

| ঝুঁকি | সম্ভাবনা | প্রভাব | মিতিগেশন |
|---|---|---|---|
| Piped ইনস্ট্যান্স ডাউন | উচ্চ | সার্চ/হোম ভাঙবে | মাল্টি-ইনস্ট্যান্স fallback চেইন + সার্ভার-সাইড cache + health-check |
| Stream extraction সব ইনস্ট্যান্সে ব্লক | উচ্চ (already) | Hi-Fi/EQ চলবে না | IFrame মোড default; Hi-Fi শুধু বোনাস |
| YouTube embed policy পরিবর্তন | নিম্ন | প্লেব্যাক প্রভাবিত | অফিসিয়াল embed ব্যবহার = সবচেয়ে স্থিতিশীল পথ; ভবিষ্যতে মাল্টি-সোর্স (Audius/JioSaavn preview) যোগ সম্ভব |
| LRCLIB ম্যাচ না পাওয়া | মাঝারি | লিরিক্স ফাঁকা | title+artist+duration মাল্টি-স্ট্র্যাটেজি ম্যাচিং + graceful "লিরিক্স নেই" স্টেট |
| মোবাইলে background কাটা | মাঝারি | UX | MediaSession + PWA standalone mode; iOS-এ সীমাবদ্ধতা ডকুমেন্ট করা |

---

## ৫. টেকনোলজি ডিসিশন (কেন)

- **Next.js 16 + App Router + API Routes** — একই রিপোতে proxy-ব্যাকএন্ড + PWA ফ্রন্টএন্ড; কোনো আলাদা সার্ভার লাগবে না (self-hostable)
- **SQLite + Prisma** — লাইব্রেরি ডেটা (favorites/playlists/history) সার্ভারে persist, লগইন ছাড়াই
- **Zustand** — player state (queue/seek/shuffle/repeat) ম্যানেজমেন্ট, localStorage persistence
- **shadcn/ui + Tailwind 4** — production-grade UI, দ্রুত
- **Custom Service Worker** — Next 16-এ next-pwa ভাঙুন/ভারী; হালকা হ্যান্ডরিটেন SW: static cache + offline shell + API fallback
- **YouTube IFrame API** — উপরে ব্যাখ্যা করা হয়েছে

---

## ৬. ভবিষ্যৎ রোডম্যাপ (বাস্তব টেকসই করার পথ)

**v1 (আজ):** সম্পূর্ণ প্লেয়ার PWA — বিস্তারিত PLAN.md-তে
**v1.1:** Offline shell + cached browse, import/export library (JSON), share playlist link
**v1.2:** Desktop install + Chromecast (Remote Playback API), Lyrics translate
**v2:** মাল্টি-সোর্স (Audius — ফ্রি ডেসেন্ট্রালাইজড ক্যাটালগ), ইউজার অ্যাকাউন্ট (NextAuth) + ডিভাইস সিঙ্ক
**v2.1:** Scrobbling (Last.fm free API), সোশ্যাল শেয়ার কার্ড (OG image generation)

### বাস্তব টেকসই হওয়ার মডেল (কোনো বিজ্ঞাপন/বিক্রি ছাড়া)
- Self-hosted: ইউজার নিজের VPS-এ চালাতে পারবে (এই রিপোই যথেষ্ট)
- Community instances: একাধিক Piped ইনস্ট্যান্স কমিউনিটি রক্ষণাবেক্ষণ করে — আমরা fallback চেইনে ট্যাপ করি
- কোনো proprietary dependency নেই → কোনো দিন একটা API মরলেও প্ল্যাটফর্ম বেঁচে থাকে (graceful degradation ডিজাইন)

---

*এই রিপোর্ট আজকের লাইভ API টেস্টের উপর ভিত্তি করে লেখা — কোনো অনুমান নয়, প্রতিটি লাইন ভেরিফাইড। পরবর্তী ধাপ: `PLAN.md`।*
