'use client'
/* Dhun — Day 45: custom protocol deep links.
 * manifest protocol_handlers maps web+dhuun://play/yt/<id> → /?pwa-link=play/yt/<id>
 * (the %s placeholder carries everything after the scheme). We resolve the
 * video id to real metadata via /api/oembed (YouTube oEmbed — public, not the
 * blocked innertube) and hand it to the player. If oEmbed fails we still play,
 * honestly labeled with the raw video id.
 */
import { usePlayer } from '@/store/player'
import { toast } from 'sonner'

export async function handleProtocolLink(raw: string): Promise<void> {
  const path = raw.replace(/^\/+/, '')
  const m = /^play\/yt\/([A-Za-z0-9_-]{6,20})$/.exec(path)
  if (!m) {
    toast.error('Unsupported Dhun link', {
      description: 'Expected web+dhuun://play/yt/<video-id>.',
    })
    return
  }
  const id = m[1]
  let title = id
  let artist = 'YouTube'
  try {
    const res = await fetch(`/api/oembed?yt=${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const d = (await res.json()) as { title?: string; author?: string }
      if (d.title) title = d.title
      if (d.author) artist = d.author
    }
  } catch {
    /* honest fallback: play labeled with the raw video id */
  }
  usePlayer.getState().playItem({
    id,
    title,
    artist,
    artwork: '',
    duration: 0,
    source: 'yt',
  })
  toast.success('Playing from Dhun link', { description: title.slice(0, 60) })
}
