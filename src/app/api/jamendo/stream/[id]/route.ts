import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { resolveJamendoStreamUrl } from '@/lib/jamendo'
import { proxyMediaResponse } from '@/lib/streams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → same-origin Jamendo audio proxy (mp3 from Jamendo storage / CDN).
// ?download=1 prefers the track's legal audiodownload link (CC-licensed full
// file, usually higher bitrate) — used by the offline download flow.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return apiError('Missing track id', { status: 400 })
  const key = req.nextUrl.searchParams.get('key')?.trim() || ''

  try {
    const { url } = await resolveJamendoStreamUrl(id, key, req.nextUrl.searchParams.get('download') === '1')
    return await proxyMediaResponse(url, req.headers.get('range'), 'audio/mpeg', req.signal)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Jamendo stream failed'
    const reason = msg.startsWith('jamendo-') ? msg : 'jamendo-stream-failed'
    const isKeyError = msg === 'jamendo-key-required' || msg === 'jamendo-key-invalid'
    return apiError(msg, {
      status: isKeyError ? 400 : 502,
      code: isKeyError
        ? msg === 'jamendo-key-required'
          ? 'key-required'
          : 'key-invalid'
        : 'upstream-unavailable',
      retryable: !isKeyError,
      reason,
    })
  }
}
