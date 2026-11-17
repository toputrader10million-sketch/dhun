# Task 4-a — Backend Engineer Work Record

## Files created/modified
- prisma/schema.prisma (replaced: Favorite, Playlist, PlaylistItem, HistoryEntry; db:push OK)
- src/lib/piped.ts (instance layer: PIPED_INSTANCES, fetchPiped w/ sticky healthy instance + 6s timeout, global cache cacheGet/cacheSet, parseStreamItem, cleanTitle server copy)
- src/app/api/search/route.ts (q+filter+nextpage pagination, 10min cache, 400 on empty q, 502 on upstream fail)
- src/app/api/suggestions/route.ts (30min cache, [] on fail)
- src/app/api/home/route.ts (5 parallel sections, 60-600s filter, 20 items, 30min cache per region)
- src/app/api/radio/[id]/route.ts (artist songs / cleanTitle query, exclude self, 15 items, 15min cache)
- src/app/api/playlist/[id]/route.ts (Piped /playlists, 15min cache, 503 on fail)
- src/app/api/lyrics/route.ts (LRCLIB /api/get -> /api/search fallback, score synced+±5s duration, 60min cache, {source:'none'} when nothing)
- src/app/api/artwork/route.ts (iTunes search limit=5, 1000x1000bb upgrade, 24h cache, {url:null} fallback)
- src/app/api/streams/[id]/route.ts (best-effort all instances 6s each, audioStreams bitrate desc, 503 w/ detail, no cache)
- src/app/api/instances/route.ts (parallel probe, latency, InstanceStatus[])
- src/app/api/favorites/route.ts (GET/POST upsert/DELETE by trackId)
- src/app/api/playlists/route.ts (GET w/ count, POST create, DELETE)
- src/app/api/playlists/[id]/route.ts (GET detail|null, PATCH, DELETE cascade)
- src/app/api/playlists/[id]/items/route.ts (POST append w/ position=count, DELETE by itemId)
- src/app/api/history/route.ts (GET limit, POST upsert by trackId + cap 200, DELETE clear)

## Key discovery (IMPORTANT for other agents)
Node 24 undici Happy-Eyeballs defaults to 250ms per-attempt connect timeout. Piped IPv4 connects take ~270ms -> Node fetch fails with "fetch failed/AggregateError" while curl/bun succeed. FIXED in src/lib/piped.ts via net.setDefaultAutoSelectFamilyAttemptTimeout(2000) at module load. All Piped routes import from '@/lib/piped' (lyrics/artwork import cleanTitle from there, so they get the fix too). If a future route does a raw fetch to Piped, import from piped.ts.

## Verified live (curl)
search 200 (music_songs + nextpage pagination 200), suggestions 200, home 200 (5 sections), radio 200, playlist detail 200 (RDCLAK5uy... 24 items), lyrics 200 synced LRC (with and without duration), artwork 200 hi-res, instances 200 (private.coffee ok:true 289ms), favorites/playlists(+items)/history full CRUD cycle 200, streams 503 (expected — upstream blocks /streams), search?q= 400.

## Known limitations
- /api/streams returns 503 today: ALL instances block /streams (500 LOGIN_REQUIRED / 403 / Cloudflare). Route is correct best-effort; player engine should handle 503 gracefully.
- Upstream quirks (not our bugs): private.coffee returns relatedStreams:[] for many LONG playlists (only short/RD radio playlists have items); albums filter returns 0 items on this instance currently; adminforge /playlists returns empty body; leptons is Cloudflare-challenged.
- lint clean, tsc clean in src/ (repo-wide tsc errors exist only in pre-existing examples/ and skills/ demo folders, outside scope).
