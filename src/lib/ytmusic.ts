// InnerTube (YouTube's internal web API) client — SERVER ONLY.
//
// 2025-11 reality: every public extraction backend (Piped, Invidious, Cobalt,
// InnerTube *player*) fails from datacenter IPs — but the SEARCH / NEXT /
// suggest endpoints remain open and keyless. This module powers search,
// suggestions, home feed and radio directly against YouTube, so the app keeps
// working even when every Piped instance is dead (the deployed default).
//
// Streaming still uses the IFrame embed (see src/engine/youtube.ts) — the
// player endpoint is bot-gated, so server-side stream extraction is
// best-effort only (src/lib/streams.ts).
import type { MusicItem } from '@/lib/types'
import { withBreaker } from '@/lib/circuit-breaker'

const WEB_CTX = {
  context: {
    client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' },
  },
}

const MUSIC_CTX = {
  context: {
    client: { clientName: 'WEB_REMIX', clientVersion: '1.20240724.01.00', hl: 'en', gl: 'US' },
  },
}

const YT_VIDEO_ID_RE = /^[\w-]{11}$/

async function innertube<T>(endpoint: string, body: unknown, timeoutMs = 8000): Promise<T> {
  // Q1.3 — the InnerTube WEB/REMIX endpoints sit behind the "ytmusic"
  // breaker: after 3 consecutive failures requests fail fast so content
  // routes can serve stale cache instead of burning 8s timeouts.
  return withBreaker('ytmusic', async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://www.youtube.com' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`innertube ${endpoint} → HTTP ${res.status}`)
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  })
}

// ---------- parse helpers ----------

/** Deep-collect every value stored under `key` anywhere in a response tree. */
function deepFind(obj: unknown, key: string, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(obj)) {
    for (const x of obj) deepFind(x, key, acc)
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === key && v && typeof v === 'object') acc.push(v as Record<string, unknown>)
      else deepFind(v, key, acc)
    }
  }
  return acc
}

function textOf(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (typeof n.simpleText === 'string') return n.simpleText
  if (typeof n.content === 'string') return n.content
  if (Array.isArray(n.runs)) {
    return (n.runs as Record<string, unknown>[])
      .map((r) => (typeof r?.text === 'string' ? r.text : ''))
      .join('')
  }
  return ''
}

/** "3:06" / "1:02:47" → seconds; invalid → 0 */
export function parseDuration(text: string): number {
  const parts = text.trim().split(':').map((p) => parseInt(p, 10))
  if (parts.some((p) => !Number.isFinite(p)) || parts.length === 0) return 0
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

/** "1,234,567 views" / "432K views" → 1234567; invalid → undefined */
export function parseViews(text: string): number | undefined {
  const m = text.match(/([\d.,]+)([KMBkM]?)\s*views/i)
  if (!m) return undefined
  let n = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return undefined
  const mult: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 }
  if (m[2] && mult[m[2]]) n *= mult[m[2]]
  return Math.round(n)
}

function ytThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

// ---------- video renderer parsing (WEB search / next) ----------

function fromVideoRenderer(v: Record<string, unknown>): MusicItem | null {
  const id = typeof v.videoId === 'string' ? v.videoId : ''
  if (!YT_VIDEO_ID_RE.test(id)) return null
  const title = textOf(v.title)
  if (!title) return null
  const author =
    textOf(v.authorText) ||
    textOf(v.longBylineText) ||
    textOf(v.shortBylineText) ||
    'Unknown artist'
  const durText = textOf(v.lengthText)
  const views = parseViews(textOf(v.viewCountText) || textOf(v.shortViewCountText))
  return {
    id,
    title,
    artist: author,
    artwork: ytThumb(id),
    duration: durText ? parseDuration(durText) : 0,
    views,
  }
}

function fromEndScreenVideo(v: Record<string, unknown>): MusicItem | null {
  const id = typeof v.videoId === 'string' ? v.videoId : ''
  if (!YT_VIDEO_ID_RE.test(id)) return null
  const title = textOf(v.title)
  if (!title) return null
  const author = textOf(v.authorText) || 'Unknown artist'
  const durText = textOf(v.lengthText)
  return {
    id,
    title,
    artist: author,
    artwork: ytThumb(id),
    duration: durText ? parseDuration(durText) : 0,
    views: parseViews(textOf(v.viewCountText)),
  }
}

function fromLockup(l: Record<string, unknown>): MusicItem | null {
  const id = typeof l.contentId === 'string' ? l.contentId : ''
  const type = typeof l.contentType === 'string' ? l.contentType : ''
  if (type && !type.includes('VIDEO')) return null
  if (!YT_VIDEO_ID_RE.test(id)) return null
  const meta = (l.metadata ?? {}) as Record<string, unknown>
  const lockupMeta = (meta.lockupMetadataViewModel ?? {}) as Record<string, unknown>
  const title =
    (lockupMeta.title && typeof (lockupMeta.title as Record<string, unknown>).content === 'string'
      ? ((lockupMeta.title as Record<string, unknown>).content as string)
      : '') || ''
  if (!title) return null
  // author lives in the avatar a11y label ("Go to channel X") or metadata rows
  let author = ''
  const img = (lockupMeta.image ?? {}) as Record<string, unknown>
  const decorated = (img.decoratedAvatarViewModel ?? {}) as Record<string, unknown>
  const a11y = typeof decorated.a11yLabel === 'string' ? decorated.a11yLabel : ''
  if (a11y) author = a11y.replace(/^Go to (channel|artist|user)\s*/i, '').trim()
  const cmv = (lockupMeta.metadata ?? {}) as Record<string, unknown>
  const rows =
    ((cmv.contentMetadataViewModel ?? {}) as Record<string, unknown>).metadataRows as
    | Array<{ metadataParts?: Array<{ text?: { content?: string } }> }>
    | undefined
  const texts: string[] = []
  for (const row of rows ?? []) {
    for (const part of row.metadataParts ?? []) {
      const c = part.text?.content
      if (c) texts.push(c)
    }
  }
  if (!author && texts.length > 0) author = texts[0]
  const durText = texts.find((t) => /^\d+(:\d+)+$/.test(t))
  const viewsText = texts.find((t) => /views?/i.test(t))
  return {
    id,
    title,
    artist: author || 'Unknown artist',
    artwork: ytThumb(id),
    duration: durText ? parseDuration(durText) : 0,
    views: viewsText ? parseViews(viewsText) : undefined,
  }
}

// ---------- music renderer parsing (WEB_REMIX search) ----------

function fromMusicListItem(m: Record<string, unknown>): MusicItem | null {
  const pid = (m.playlistItemData ?? {}) as Record<string, unknown>
  const ne = (m.navigationEndpoint ?? {}) as Record<string, unknown>
  const we = (ne.watchEndpoint ?? {}) as Record<string, unknown>
  let id = typeof pid.videoId === 'string' ? pid.videoId : ''
  if (!id && typeof we.videoId === 'string') id = we.videoId
  if (!id) {
    const anyWatch = deepFind(m, 'watchEndpoint')
    const hit = anyWatch.find((w) => typeof w.videoId === 'string' && YT_VIDEO_ID_RE.test(w.videoId as string))
    if (hit) id = hit.videoId as string
  }
  if (!YT_VIDEO_ID_RE.test(id)) return null // albums/artists/playlists have no playable video id
  const cols = (m.flexColumns ?? []) as Array<Record<string, unknown>>
  const colText = (c: Record<string, unknown>) => {
    const renderer = (c.musicResponsiveListItemFlexColumnRenderer ?? {}) as Record<string, unknown>
    return textOf(renderer.text) // text lives at .text (simpleText | content | runs)
  }
  const title = cols.length > 0 ? colText(cols[0]) : ''
  if (!title) return null
  // col2 patterns: "Song • Artist", "Video • Artist", "4:30" (video remixes),
  // "Album" / "Artist" / "Playlist" (non-playable rows are filtered by id check)
  const col2 = cols.length > 1 ? colText(cols[1]) : ''
  const parts = col2
    .split('•')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const TYPE_RE = /^(song|video|album|artist|playlist|single|ep|featured)$/i
  const isDur = (p: string) => /^\d+(:\d+)+$/.test(p)
  const isViews = (p: string) => /^[\d.,]+[KMBkM]?\s*(views|plays)$/i.test(p)
  const durPart = parts.find(isDur)
  const artistPart = parts.find((p) => !TYPE_RE.test(p) && !isDur(p) && !isViews(p))
  return {
    id,
    title,
    artist: artistPart || 'Unknown artist',
    artwork: ytThumb(id),
    duration: durPart ? parseDuration(durPart) : 0,
  }
}

// ---------- public API ----------

/** Filter sp-params for WEB search (URL-encoded base64 protobuf). */
export const SEARCH_SP = {
  videos: 'EgIQAQ%3D%3D',
  channels: 'EgIQAg%3D%3D',
  playlists: 'EgIQAw%3D%3D',
} as const

export interface YtSearchResult {
  items: MusicItem[]
  continuation?: string
}

/** WEB search — best for videos/playlists/channels and general queries. */
export async function ytWebSearch(
  query: string,
  opts?: { sp?: string; continuation?: string; timeoutMs?: number }
): Promise<YtSearchResult> {
  const body: Record<string, unknown> = { ...WEB_CTX, query }
  if (opts?.sp) body.params = opts.sp
  if (opts?.continuation) body.continuation = opts.continuation
  const data = await innertube<Record<string, unknown>>('search', body, opts?.timeoutMs)
  const videos = [
    ...deepFind(data, 'videoRenderer'),
    ...deepFind(data, 'gridVideoRenderer'),
    ...deepFind(data, 'lockupViewModel'),
  ]
  const items: MusicItem[] = []
  const seen = new Set<string>()
  for (const v of videos) {
    const item = v.title && (v.videoId || v.contentId) ? v : null
    if (!item) continue
    const parsed =
      fromVideoRenderer(v) ??
      (v.contentId ? fromLockup(v) : null) ??
      fromEndScreenVideo(v)
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id)
      items.push(parsed)
    }
  }
  const cont = deepFind(data, 'continuationCommand')[0]
  return {
    items,
    continuation: cont && typeof cont.token === 'string' ? cont.token : undefined,
  }
}

/** YouTube Music (WEB_REMIX) search — song results only (playable video ids). */
export async function ytMusicSearch(query: string, timeoutMs = 8000): Promise<MusicItem[]> {
  const data = await innertube<Record<string, unknown>>(
    'search',
    { ...MUSIC_CTX, query },
    timeoutMs
  )
  const nodes = deepFind(data, 'musicResponsiveListItemRenderer')
  const items: MusicItem[] = []
  const seen = new Set<string>()
  for (const m of nodes) {
    const parsed = fromMusicListItem(m)
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id)
      items.push(parsed)
    }
  }
  return items
}

/** Related videos for a track ("Start radio" / autoplay) via the /next endpoint. */
export async function ytRelated(videoId: string, timeoutMs = 8000): Promise<MusicItem[]> {
  const data = await innertube<Record<string, unknown>>(
    'next',
    { ...WEB_CTX, videoId },
    timeoutMs
  )
  const items: MusicItem[] = []
  const seen = new Set<string>([videoId])
  for (const l of deepFind(data, 'lockupViewModel')) {
    const parsed = fromLockup(l)
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id)
      items.push(parsed)
    }
  }
  for (const v of deepFind(data, 'endScreenVideoRenderer')) {
    const parsed = fromEndScreenVideo(v)
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id)
      items.push(parsed)
    }
  }
  return items
}

/**
 * Search suggestions (Google complete) — extremely reliable, keyless.
 * Response is JS: window.google.ac.h(["q",[["s",0],["s2",0]],…]);
 */
export async function ytSuggestions(query: string, timeoutMs = 5000): Promise<string[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&hl=en&q=${encodeURIComponent(query)}`,
      { signal: ctrl.signal, cache: 'no-store' }
    )
    if (!res.ok) return []
    const raw = await res.text()
    const m = raw.match(/window\.google\.ac\.h\(([\s\S]*)\)\s*;?\s*$/)
    if (!m) return []
    const parsed = JSON.parse(m[1]) as unknown
    if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) return []
    return (parsed[1] as unknown[])
      .map((entry) => (Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : ''))
      .filter((s) => s.length > 0)
      .slice(0, 10)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
