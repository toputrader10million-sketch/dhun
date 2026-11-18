/* Dhun — playlist share codes + JSON export (Day 27).
 *
 * A share code is a compact, copy-pasteable string:
 *   DHUN1.<base64url(utf-8 JSON)>
 * Any Dhun user can paste it into Library → Import to recreate the playlist.
 * JSON files carry the same payload with a { format: 'dhun-playlist' } envelope.
 */

export interface PlaylistExport {
  name: string
  description?: string | null
  items: Array<{
    trackId: string
    title: string
    artist: string
    artwork?: string | null
    duration?: number
    source?: string
  }>
}

export interface DecodeResult {
  ok: boolean
  data?: PlaylistExport
  error?: string
}

const PREFIX = 'DHUN1.'

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function sanitize(data: unknown): PlaylistExport | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 120) : ''
  if (!name) return null
  const rawItems = Array.isArray(d.items) ? d.items : []
  const items: PlaylistExport['items'] = []
  const seen = new Set<string>()
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue
    const r = it as Record<string, unknown>
    const trackId = typeof r.trackId === 'string' ? r.trackId.slice(0, 200) : ''
    const title = typeof r.title === 'string' ? r.title.slice(0, 300) : ''
    const artist = typeof r.artist === 'string' ? r.artist.slice(0, 300) : ''
    if (!trackId || !title || !artist) continue
    const key = `${typeof r.source === 'string' ? r.source : 'yt'}:${trackId}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      trackId,
      title,
      artist,
      artwork: typeof r.artwork === 'string' ? r.artwork : null,
      duration: typeof r.duration === 'number' ? Math.round(r.duration) : 0,
      source: typeof r.source === 'string' && ['yt', 'au', 'jm'].includes(r.source) ? r.source : 'yt',
    })
  }
  return {
    name,
    description: typeof d.description === 'string' ? d.description.slice(0, 300) : null,
    items: items.slice(0, 500),
  }
}

/** Encode a playlist into a DHUN1 share code. */
export function encodePlaylistCode(playlist: PlaylistExport): string {
  const json = JSON.stringify({ name: playlist.name, description: playlist.description ?? null, items: playlist.items })
  const bytes = new TextEncoder().encode(json)
  return PREFIX + toBase64Url(bytes)
}

/** Decode a share code (or a pasted JSON export). Never throws. */
export function decodePlaylistCode(code: string): DecodeResult {
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, error: 'Paste a Dhun share code first.' }
  try {
    if (trimmed.startsWith(PREFIX)) {
      const bytes = fromBase64Url(trimmed.slice(PREFIX.length))
      if (!bytes) return { ok: false, error: 'That code is corrupted — copy it again from the source device.' }
      const json = new TextDecoder().decode(bytes)
      const data = sanitize(JSON.parse(json))
      if (!data) return { ok: false, error: 'That code does not contain a valid playlist.' }
      return { ok: true, data }
    }
    // Fallback: raw JSON (from an exported file pasted as text)
    const parsed = JSON.parse(trimmed)
    const payload = parsed && (parsed as Record<string, unknown>).format === 'dhun-playlist' ? (parsed as Record<string, unknown>).playlist : parsed
    const data = sanitize(payload)
    if (!data) return { ok: false, error: 'This JSON is not a Dhun playlist export.' }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Could not read that code — is it complete?' }
  }
}

/** Download a playlist as a JSON file. */
export function exportPlaylistFile(playlist: PlaylistExport): void {
  const payload = {
    format: 'dhun-playlist',
    version: 1,
    exportedAt: new Date().toISOString(),
    playlist: playlist,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${playlist.name.replace(/[^\w\u0980-\u09FF -]+/g, '').trim() || 'playlist'}.dhun.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
