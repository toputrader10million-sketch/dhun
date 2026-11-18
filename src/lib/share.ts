'use client'
/* Dhun — Sharing (Day 13 "Share / cheers").
 * shareTrack: plain text + link via Web Share API, clipboard fallback.
 * shareTrackCard: composes a branded 1200×630 share card (artwork + title +
 * Dhun wordmark) on a canvas and shares it as an image file — falls back to
 * text share when the device/browser doesn't support file sharing.
 */

async function textShare(opts: { title: string; artist?: string; url?: string }): Promise<'shared' | 'copied' | 'failed'> {
  const text = `${opts.title}${opts.artist ? ' — ' + opts.artist : ''}`
  const url = opts.url || (typeof window !== 'undefined' ? window.location.origin : '')
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: opts.title, text, url })
      return 'shared'
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      return 'copied'
    }
    return 'failed'
  } catch (err) {
    // User dismissed the share sheet — not an error, stay silent.
    if (err instanceof Error && err.name === 'AbortError') return 'shared'
    return 'failed'
  }
}

/** Share a track via Web Share API, falling back to clipboard copy. */
export async function shareTrack(opts: {
  title: string
  artist?: string
}): Promise<'shared' | 'copied' | 'failed'> {
  return textShare(opts)
}

/* ---------- share card (image) ---------- */

function proxiedArtwork(artwork: string | undefined): string | null {
  if (!artwork || !/^https?:/i.test(artwork)) return null
  return `/api/artwork-proxy?u=${encodeURIComponent(artwork)}`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = w
      if (lines.length === maxLines) return lines
    } else {
      line = candidate
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines && lines[maxLines - 1]) {
    const last = lines[maxLines - 1]
    if (ctx.measureText(last).width > maxWidth) {
      lines[maxLines - 1] = `${last.slice(0, 38)}…`
    }
  }
  return lines
}

async function drawShareCard(opts: { title: string; artist: string; artwork?: string }): Promise<Blob | null> {
  const W = 1200
  const H = 630
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Premium dark gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0b0b0f')
  bg.addColorStop(0.55, '#14090f')
  bg.addColorStop(1, '#1c0a12')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Accent glow blobs (static, cheap "brand" feel)
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.2, 40, W * 0.82, H * 0.2, 420)
  glow.addColorStop(0, 'rgba(244, 63, 94, 0.35)')
  glow.addColorStop(1, 'rgba(244, 63, 94, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Artwork (same-origin proxy → untainted canvas) with graceful skip
  const proxy = proxiedArtwork(opts.artwork)
  if (proxy) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = () => reject(new Error('artwork load failed'))
        im.src = proxy
        setTimeout(() => reject(new Error('artwork timeout')), 6000)
      })
      const size = 420
      const x = 80
      const y = (H - size) / 2
      ctx.save()
      roundRect(ctx, x, y, size, size, 32)
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 40
      ctx.shadowOffsetY = 18
      ctx.fillStyle = '#000'
      ctx.fill()
      ctx.restore()
      ctx.save()
      roundRect(ctx, x, y, size, size, 32)
      ctx.clip()
      ctx.drawImage(img, x, y, size, size)
      ctx.restore()
    } catch {
      /* artwork optional — card still looks fine without it */
    }
  }

  // Text block
  const textX = 560
  const maxWidth = W - textX - 80

  ctx.fillStyle = '#f43f5e'
  ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('♪ Dhun', textX, 120)

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 58px system-ui, -apple-system, "Segoe UI", sans-serif'
  const titleLines = wrapText(ctx, opts.title, maxWidth, 3)
  let y = 220
  for (const line of titleLines) {
    ctx.fillText(line, textX, y)
    y += 66
  }

  if (opts.artist) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = '500 34px system-ui, -apple-system, "Segoe UI", sans-serif'
    const artistLines = wrapText(ctx, opts.artist, maxWidth, 2)
    for (const line of artistLines.slice(0, 2)) {
      ctx.fillText(line, textX, y + 16)
      y += 46
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '500 26px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('Listen free — no ads, no login', textX, H - 60)

  return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.92))
}

/**
 * Share a branded image card for a track. Falls back to the text share when
 * file sharing is unavailable (desktop Firefox, some Android WebViews…).
 */
export async function shareTrackCard(opts: {
  title: string
  artist?: string
  artwork?: string
}): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.share) return textShare(opts)
    const blob = await drawShareCard({ title: opts.title, artist: opts.artist ?? '', artwork: opts.artwork })
    const files = blob ? [new File([blob], 'dhun-track.png', { type: 'image/png' })] : []
    const canFiles = files.length > 0 && navigator.canShare?.({ files }) === true
    if (canFiles) {
      await navigator.share({
        title: opts.title,
        text: `♪ ${opts.title}${opts.artist ? ' — ' + opts.artist : ''}`,
        files,
      })
      return 'shared'
    }
    return textShare(opts)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'shared'
    return textShare(opts)
  }
}
