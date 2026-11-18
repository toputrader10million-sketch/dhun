# Dhun — ৬০ দিনের প্রিমিয়াম রোডম্যাপ (PLAN-60)

> লক্ষ্য: Dhun-কে ৬০ দিনে ধাপে ধাপে একটা **pro/premium-grade মিউজিক প্ল্যাটফর্ম** বানানো।
> ক্যাডেন্স: **প্রতিদিন অন্তত ১টা shippable increment** — কোড → ব্রাউজার ভেরিফিকেশন → push → Vercel ডেপ্লয়। কোনো গ্যাপ নেই।

---

## ০. মূলনীতি (প্রতিদিনের কাজ এই ৫টা নিয়ম মানবে)

1. **ইউজারের সমস্যা আগে**: প্রতিটা দিনের কাজ একটা বাস্তব সমস্যা সমাধান করবে (bug, ফ্রিকশন, ব্যথা) — "শুধু ফিচার" নয়।
2. **গভীর বিশ্লেষণ আগে, কোড পরে**: প্রতিটা দিন শুরু হবে root-cause/usage বিশ্লেষণ দিয়ে।
3. **শিপ করা না হলে দিন শেষ নয়**: lint + browser E2E + push + প্রোডাকশন যাচাই — সব সবুজ না হলে দিন শেষ হয় না।
4. **সৎ ইউএক্স**: যা কাজ করে না, UI তা মিথ্যা বলবে না (যেমন YouTube extraction ব্লকড হলে স্পষ্ট বার্তা)।
5. **ফ্রি ফান্ডামেন্ট**: সব ফিচার ফ্রি API দিয়ে; কোনো paid dependency নয়।

---

## ১. বর্তমান অবস্থা (Day 0 — গভীর বিশ্লেষণের সারাংশ)

**ঠিক আছে**: iframe প্লেব্যাক (hd720 ফিক্স), Audius প্লেব্যাক+ডাউনলোড, Turso ক্লাউড সিঙ্ক, favorites/playlists/history, lyrics, থিম+accent, PWA ইনস্টল, queue reorder, MediaSession, offline banner, SW v4।

**ভাঙা/অনুপস্থিত (আজকের বিশ্লেষণে ধরা পড়েছে)**:
| সমস্যা | Root cause |
|---|---|
| YouTube গান ডাউনলোড হয় না | ২০২৫-এ Piped সব পাবলিক ইনস্ট্যান্সে audioStreams=0 (server+datacenter IP-তে YouTube extraction ব্লকড); innertube ANDROID/IOS client precondition-fail; WEB client "UNPLAYABLE"; Invidious সব ডেড |
| Hi-Fi মোড YouTube-এ ফেল | একই resolver নির্ভরতা |
| অফলাইন কোল্ড-স্টার্ট দুর্বল | SW শুধু manifest/icons precache করে — app shell '/' precache নেই |
| অফলাইন ইউএক্স | অফলাইনে সাজেশন/সার্চ খালি স্টেট গাইড করে না |

---

## ২. ফেজ কাঠামো (৬০ দিন × ৮ ফেজ)

### Phase A — Foundation & Reliability (Day 1–7)
| Day | Task ID | কাজ |
|---|---|---|
| 1 | D1 | **Offline/ডাউনলোড রিপেয়ার**: SW shell precache (v5), client-assisted Piped resolve (ইউজারের device IP থেকে), `/api/audio?upstream=` ভ্যালিডেটেড প্রক্সি, Audius download E2E ভেরিফাই, সৎ error toast |
| 2 | D2 | Premium ভিজ্যুয়াল আইডেন্টিটি ফেজ-১: গ্লোবাল gradient/glass টোকেন, Now Playing আর্টওয়ার্ক ambient glow, স্মুথ transition |
| 3 | D3 | Premium ভিজ্যুয়াল ফেজ-২: micro-interactions (hover/press), animated equalizer bars, স্কেলেটন পলিশ |
| 4 | D4 | পারফরম্যান্স: bundle audit, ইমেজ lazy/size, ভিউ lazy-load, প্রথম রেন্ডার টাইম কমানো |
| 5 | D5 | অ্যাকসেসিবিলিটি পাস: keyboard shortcuts (space/arrow/M), focus rings, ARIA অডিট |
| 6 | D6 | রেজিলিয়েন্স: সব API graceful degradation + retry, অফলাইন empty-state গাইড |
| 7 | D7 | উইক রিভিউ: Lighthouse পাস, বাগ বেইলআউট, ডক আপডেট |

### Phase B — Premium Core (Day 8–14)
| Day | Task ID | কাজ |
|---|---|---|
| 8 | D8 | **Pro থিম ইঞ্জিন**: ৬+ কিউরেটেড প্রিমিয়াম থিম (Aurora, Sunset, Forest, Mono, Neon, Ocean-dawn) + থিম প্রিভিউ কার্ড |
| 9 | D9 | Accent designer + custom gradient জেনারেটর |
| 10 | D10 | অডিও পলিশ: crossfade, gapless tune, replay-gain স্টাইল normalization flag |
| 11 | D11 | Sleep timer pro: fade-out, "গান শেষে" মোড, preset রিমাইন্ডার |
| 12 | D12 | কারাওকে-স্টাইল lyrics (synced বড় ফন্ট মোড) + ফন্ট সাইজ কন্ট্রোল |
| 13 | D13 | **Share/Charts (Dhun "cheers")**: Web Share API share-card, "Now playing" টেক্সট শেয়ার |
| 14 | D14 | Charts পেজ: Audius trending + YouTube কিউরেটেড চার্ট, region ট্যাব |

### Phase C — Smart/AI (Day 15–24)
| Day | Task ID | কাজ |
|---|---|---|
| 15 | D15 | AI DJ ফাউন্ডেশন: history-based পার্সোনাল "Daily Mix" কম্পোজার |
| 16 | D16 | ন্যাচারাল ল্যাঙ্গুয়েজ সার্চ ("বৃষ্টির দিনে বাংলা গান") → LLM query plan |
| 17 | D17 | Smart radio: mood/era/artist বেইজড ইনফিনিট queue |
| 18 | D18 | Auto-mix: queue শেষে নিজে থেকে সিমিলার ট্র্যাক যোগ |
| 19 | D19 | AI playlist builder: prompt → ২৫-গানের playlist (LLM + search pipeline) |
| 20 | D20 | Smart home sections: টাইম-অব-ডে + আবহাওয়া-সচেতন কিউরেশন |
| 21 | D21 | ভয়েস সার্চ (Web Speech API) |
| 22 | D22 | "Dhun Copilot" — অ্যাপের ভেতরে AI সহায়ক (সাজেস্ট/সার্চ/সেটিংস গাইড) |
| 23 | D23 | Smart downloads: ব্যাকগ্রাউন্ডে প্রিয় গান auto-cache (Wi-Fi বাস্তবায়ন নোটসহ) |
| 24 | D24 | Phase C রিভিউ + টিউনিং |

### Phase D — Pro Power Features (Day 25–33)
| Day | Task ID | কাজ |
|---|---|---|
| 25 | D25 | EQ প্রোফাইল সিস্টেম: preset (Vocal/Bass/Treble/Flat/Custom) + per-source |
| 26 | D26 | Visualizer মোড ৩টা (bars/wave/ambient ring) |
| 27 | D27 | Playlist import/export (JSON + shareable code) |
| 28 | D28 | মাল্টি-ডিভাইস সিঙ্ক hardening: queue sync conflict rules |
| 29 | D29 | Artist page (top tracks, related) |
| 30 | D30 | Album/singles grouping (iTunes enrichment দিয়ে) |
| 31 | D31 | Widgets: desktop mini spectrum + compact now-playing |
| 32 | D32 | Cast/AirPlay polish + handoff UX |
| 33 | D33 | Phase D রিভিউ |

### Phase E — Content & Community (Day 34–42)
| Day | Task ID | কাজ |
|---|---|---|
| 34 | D34 | Public playlist share-links (read-only token URL) |
| 35 | D35 | Trending charts by genre/region |
| 36 | D36 | Curated editorial sections (Waves: Bangla/Bollywood/Punjabi/Global) |
| 37 | D37 | Reaction/like analytics (anonymous aggregate) |
| 38 | D38 | Discovery feed improvements |
| 39 | D39 | Lyrics source expansion + বাংলা lyrics বিশেষ কেয়ার |
| 40 | D40 | Onboarding tour (নতুন ইউজার ৩-স্টেপ গাইড) |
| 41 | D41 | Empty-state সিস্টেম ইউনিফাই |
| 42 | D42 | Phase E রিভিউ |

### Phase F — Platform Depth (Day 43–50)
| Day | Task ID | কাজ |
|---|---|---|
| 43 | D43 | i18n ফাউন্ডেশন: বাংলা/English সুইচ |
| 44 | D44 | বাংলা UI অনুবাদ সম্পূর্ণ |
| 45 | D45 | PWA excellence: shortcuts, share target, protocol handler |
| 46 | D46 | Install UX polish (custom install sheet) |
| 47 | D47 | Performance budget enforcement (Lighthouse 90+ gate) |
| 48 | D48 | Storage manager: cache quota UI, auto-evict LRU option |
| 49 | D49 | Network health dashboard উন্নত (instance latency graph) |
| 50 | D50 | Phase F রিভিউ |

### Phase G — Dhun Premium টিয়ার (Day 51–57)
| Day | Task ID | কাজ |
|---|---|---|
| 51 | D51 | Premium টিয়ার ডিজাইন: কী কী Pro-তে যাবে (সব core ফ্রি থাকবে; Pro = থিম ইঞ্জিন, AI DJ, EQ pro, visualizer, cloud extras) |
| 52 | D52 | Feature-flag সিস্টেম + Pro badge/upsell sheet |
| 53 | D53 | Pro unlock মেকানিজম (ফ্রি-ফর-এখন: feedback/loyalty ভিত্তিক unlock কোড) |
| 54 | D54 | Premium visual signature (Pro থিম + animated icon) |
| 55 | D55 | Pro settings panel + usage stats ড্যাশবোর্ড |
| 56 | D56 | Landing/about page premium রিডিজাইন |
| 57 | D57 | পুরো অ্যাপ premium polish sweep |

### Phase H — Launch & Hardening (Day 58–60)
| Day | Task ID | কাজ |
|---|---|---|
| 58 | D58 | ফুল রিগ্রেশন পাস (সব গোল্ডেন পাথ) + বাগ ফিক্স |
| 59 | D59 | Docs: README, PLAN-60 আপডেট, কমিউনিটি নোট |
| 60 | D60 | **৬০-দিনের লঞ্চ রিভিউ** — মেট্রিক সামারি + পরবর্তী কোয়ার্টার প্ল্যান |

---

## ৩. প্রতিদিনের Quality Gate (কোনো ব্যতিক্রম নেই)

1. `bun run lint` — শূন্য error
2. Agent Browser E2E — দিনের ফিচার ব্রাউজারে প্রমাণিত
3. dev.log — runtime error নেই
4. Mobile + desktop responsive চেক
5. Push GitHub → Vercel অটো-ডেপ্লয় → প্রোডাকশন URL-এ যাচাই

## ৪. রিস্ক রেজিস্টার (আগে থেকে জানা)

| রিস্ক | প্রতিকার |
|---|---|
| YouTube extraction পাবলিকলি ব্লকড (২০২৫) | iframe প্রিমারি প্লেব্যাক; ডাউনলোডে client-assisted resolve + Audius গ্যারান্টিড পাথ; সৎ মেসেজিং |
| Piped instance churn | স্বয়ংক্রিয় health-check + /api/instances ড্যাশবোর্ড (আছে), নতুন instance সহজে যোগযোগযোগ |
| Turso কোটা | local-first ডিজাইন (ইতিমধ্যে), ব্যাচ sync |
| বড় AI ফিচারে লেটেন্সি | streaming response + ক্যাশ + skeleton UX |

---

> **Day 1 আজ শুরু** — Offline/ডাউনলোড রিপেয়ার (নিচে Day-1 সেকশন)।

---

## ৫. অগ্রগতি লগ (শিপ হওয়া ইনক্রিমেন্ট)

- **Day 1** ✅ — Offline/ডাউনলোড রিপেয়ার: SW v5 shell precache, offline-safe seek (206 slice), client-assisted resolve, ভ্যালিডেটেড upstream proxy। Local + production E2E পাস।
- **Days 2–10** ✅ — Premium ভিজ্যুয়াল (gradient/glass tokens, ambient glow), micro-interactions + EQ bars, পারফরম্যান্স, কিবোর্ড শর্টকাট + ARIA, রেজিলিয়েন্স, Lighthouse পাস, Pro থিম ইঞ্জিন (৬ থিম), Accent designer + gradient, crossfade/gapless + Smart Match (YouTube ডাউনলোড রিপেয়ার: Jamendo/Audius বিকল্প)।
- **Day 11** ✅ — **Sleep timer pro**: preset + custom মিনিট, "stop after this track" মোড (প্লেয়ার-লেভেল এনফোর্সমেন্ট, ডায়ালগ unmounted হলেও কাজ করে), +5/+15 min এক্সটেনশন, ৫-সেকেন্ড ভলিউম ফেড, সৎ টোস্ট। স্টেট `src/lib/sleep-timer.ts`-এ — UI ও প্লেয়ার দুটোই ব্যবহার করে।
- **Day 12** ✅ — **কারাওকে lyrics**: সেন্টার-লাইন কারাওকে মোড, active লাইনে লাইভ "sweep" fill (background-clip: text, লাইন প্রগ্রেস = position/line-span), A-/A+ ফন্ট সাইজ কন্ট্রোল (S/M/L/XL, persisted), Settings-এ Lyrics সেকশন।
- **Day 13** ✅ — **Share-card**: ক্যানভাসে ১২০০×৬৩০ ব্র্যান্ডেড কার্ড (artwork + title + Dhun wordmark) → Web Share API files (canShare গার্ড) → টেক্সট/ক্লিপবোর্ড ফলব্যাক। Artwork CORS-নিরাপদ: allow-listed same-origin `/api/artwork-proxy`।
- **Day 14** ✅ — **Charts ভিউ**: নতুন nav item (ডেস্কটপ সাইডবার + মোবাইল bottom nav, ৬ আইটেম)। Region charts (BD/IN/PK/US/GB/DE/JP/Global — YouTube Music কিউরেশন), Audius trending (genre filter), Genres ট্যাব (১০ জনর)। `/api/charts`, ১ ঘণ্টা ক্যাশ।
- **Day 15** ✅ — **AI DJ Daily Mix**: হিস্ট্রি + favorites → weighted top artists → ব্যক্তিগত + "similar" discovery কোয়েরি → ইন্টারলিভ/ডিউপ/শাফল → ২৮-ট্র্যাক মিক্স, ঘণ্টায় রিফ্রেশ। ডেটা না থাকলে trending ফলব্যাক। Home-এ হিরো কার্ড (Play / Shuffle / New mix)।
- **Day 16** ✅ — **Natural language search**: "রেইনি ইভনিং বাংলা গান" টাইপ কোয়েরি → LLM প্ল্যানার (z-ai SDK, backend-only) → ১–৩ ক্যাটালগ কোয়েরি → ইন্টারলিভড রেজাল্ট + interpretation + mood chips। LLM না চললে deterministic rules প্ল্যানার (বাংলা/English কিওয়ার্ড ম্যাপ)। `/api/ai/nl-search`।
- **Day 17** ✅ — **Smart radio**: Now Playing-এ "Smart radio" popover — ১০ mood + ৫ era chips + "Based on this track"। `/api/radio/[id]?mood=&era=` mood/era কোয়েরি + seed-blend।
- **Day 18** ✅ — **Auto-mix**: কিউ শেষের ২ ট্র্যাকের মধ্যে এলে সাইলেন্টলি similar ট্র্যাক যোগ হয় (৩০ সেকেন্ড থ্রটল, single-flight) — মিউজিক কখনো থামে না। Settings-এ টগল।
- **Day 19** ✅ — **AI playlist builder**: Library-তে "AI playlist" ডায়ালগ — prompt (বাংলা/English) → LLM ২৫-ট্র্যাক spec → ক্যাটালগ রেজোলিউশন (bounded concurrency, playable-title ফিল্টার) → আসল playlist সেভ + অটো-ওপেন। সৎ progress UI (composing → x/N matched → saving)। `/api/ai/playlist`।
- **Day 20** ✅ — **Smart home**: লোকাল hour অনুযায়ী ডে-পার্ট সেকশন (Morning Energy / Afternoon Focus / Evening Vibes / Late Night Lo-fi), আবহাওয়া-সচেতন সেকশন (বৃষ্টি → "Rainy Day Melodies" প্রথমে), লাইভ weather চিপ (Open-Meteo, region→city ম্যাপ — geolocation permission ছাড়া)। `/api/weather`।
- **Days 21-a** ✅ — **Dynamic & Responsive pass** (ইউজার রিকোয়েস্ট "make our platform more dynamic and responsive"):
  - **Animated view transitions** — framer-motion `AnimatePresence mode="wait"` দিয়ে প্রতিটা ভিউ সুইচ এখন fade+slide (transform-only, `useReducedMotion` সচেতন)।
  - **Animated navigation** — ডেস্কটপ সাইডবারে `layoutId` sliding accent pill, মোবাইল bottom nav-এ sliding top rail + springy active icon।
  - **Responsive breakpoint ফিক্স** — সাইডবার md(768px) → lg(1024px): ট্যাবলেট এখন cramped sidebar-এর বদলে full-width layout + bottom nav পায় (mini-player/seek row/footer সব lg-এ রি-অ্যালাইন)।
  - **Real bug fix** — Tailwind-এ `xs` breakpoint কখনো ডিফাইন করা হয়নি → mini-player-এর Previous বাটন সব স্ক্রিনে invisible ছিল; `--breakpoint-xs: 30rem` যোগ → 480px+ এ দেখা যায় (browser-verified)।
  - **MiniPlayer dynamism** — spring slide-up entrance, overflow-মাপা ping-pong marquee title (শর্ট টাইটেলে অ্যানিমেশন নেই), progress line-এ glowing leading dot।
  - **Now Playing** — ট্র্যাক বদলালে artwork `dhun-art-in` + title `dhun-fade-slim` entrance।
  - **Scroll-reactive header** — মোবাইল/ট্যাবলেট হেডার স্ক্রলে glass গাঢ় + elevation।
  - **Home** — Jump back in + Audius তালিকায় staggered row entrance, গ্রিটিং `md:text-4xl`।
  - সব অ্যানিমেশন `prefers-reduced-motion` সম্মান করে; lint শূন্য error; browser E2E (390/520/800/1280px) পাস।
- **Day 21** ✅ — **Voice search (Web Speech API)**: Explore সার্চ বারে mic বাটন (অসমর্থিত ব্রাউজারে বাটনই লুকানো — মিথ্যা UI নেই)। Region-aware locale (BD→bn-BD, IN→en-IN…), লাইভ interim caption + EQ indicator, single-shot dictation → টেক্সট সার্চ বক্সে → সাথে সাথে search। প্রতিটা failure-এ নির্দিষ্ট সৎ টোস্ট (mic blocked / no speech / network)। `src/hooks/use-voice-search.ts`। Browser-verified: mic button render, permission-denied toast, স্টেট রিসেট।
- **Day 22** ✅ — **Dhun Copilot**: ফ্লোটিং dock বাটন (সব ব্রেকপয়েন্টে player chrome-এর উপরে, spring entrance) → bottom-sheet চ্যাট। Backend `/api/ai/copilot`: z-ai LLM + সম্পূর্ণ app knowledge (সব ফিচারের বর্ণনা), context-aware (current track/view/region), multilingual; মিউজিক রিকোয়েস্টে ১–২ catalog query → প্লেয়েবল ট্র্যাক ৮টা চ্যাটেই "Tap to play" লিস্টে; LLM ডাউন থাকলে rule-based fallback (downloads/themes/sleep/shortcuts/hifi topics)। ফলো-আপ chips ক্লিকেবল। Browser E2E: workout mix → ট্র্যাক লিস্ট → ট্র্যাক ক্লিকে মিনি প্লেয়ারে প্লে; "what themes are available" → নির্ভুল গাইড + contextual chips; mobile 390px যাচাই।
- **সাথে**: ১০টা pre-existing TypeScript error ফিক্স, TrackImage prop হার্ডেনিং, সব নতুন ভিউ mobile-first responsive (browser-verified)।

