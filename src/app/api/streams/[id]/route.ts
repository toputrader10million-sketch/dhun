import { NextRequest, NextResponse } from 'next/server'
import { PIPED_INSTANCES } from '@/lib/piped'
import type { AudioStream } from '@/lib/types'

export const runtime = 'nodejs'

interface PipedAudioStream {
  url?: string
  bitrate?: number
  mimeType?: string
  quality?: string
  codec?: string
}

interface StreamsResponse {
  title?: string
  duration?: number
  audioStreams?: PipedAudioStream[]
}

/** Try /streams/{id} on every instance, 6s timeout each, return first success. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing stream id' }, { status: 400 })

  const errors: string[] = []

  for (const base of PIPED_INSTANCES) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(`${base}/streams/${encodeURIComponent(id)}`, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        errors.push(`${base} → HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as StreamsResponse
      const audio: AudioStream[] = (data.audioStreams ?? [])
        .filter((s) => typeof s.url === 'string' && s.url && typeof s.bitrate === 'number')
        .map((s) => ({
          url: s.url as string,
          bitrate: s.bitrate as number,
          mimeType: s.mimeType ?? 'audio/mp4',
          quality: s.quality ?? `${Math.round((s.bitrate ?? 0) / 1000)} kbps`,
          codec: s.codec,
        }))
        .sort((a, b) => b.bitrate - a.bitrate)

      if (audio.length === 0) {
        errors.push(`${base} → no audio streams`)
        continue
      }

      return NextResponse.json({
        title: data.title ?? '',
        duration: typeof data.duration === 'number' ? data.duration : 0,
        audioStreams: audio,
        instance: base,
      })
    } catch (err) {
      errors.push(`${base} → ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  return NextResponse.json(
    { error: `All Piped instances failed for /streams/${id}`, detail: errors },
    { status: 503 }
  )
}
