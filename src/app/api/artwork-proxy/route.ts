import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'

export const runtime = 'nodejs'

/* Day 13 — same-origin image proxy for share cards.
 * Canvas.toBlob() throws on cross-origin images unless the host sends CORS
 * headers (many CDNs don't). This proxy streams artwork bytes same-origin so
 * the share card can always be composed. Allow-list only — never an open proxy. */

const ALLOWED_SUFFIXES = [
  'ytimg.com',
  'youtube.com',
  'audius.co',
  'auscdn.co',
  'mypinata.cloud',
  'ipfs.io',
  'googleusercontent.com',
  'jamendo.com',
]

function allowed(u: URL): boolean {
  const host = u.hostname.toLowerCase()
  return ALLOWED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u') ?? ''
  if (!raw) return apiError('Missing u', { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return apiError('Invalid url', { status: 400 })
  }
  if (!/^https?:$/.test(target.protocol) || !allowed(target)) {
    return apiError('Upstream not allowed', { status: 403, code: 'bad-request' })
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const upstream = await fetch(target.toString(), {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Dhun/2.0 (share-card proxy)' },
      cache: 'no-store',
    })
    clearTimeout(t)
    if (!upstream.ok || !upstream.body) {
      return apiError('Upstream fetch failed', { status: 502 })
    }
    const ctype = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!/^image\//.test(ctype)) {
      return apiError('Not an image', { status: 415, code: 'bad-request' })
    }
    const buf = await upstream.arrayBuffer()
    // Cap at 8 MB — artwork images are far smaller; guard memory anyway.
    if (buf.byteLength > 8 * 1024 * 1024) {
      return apiError('Image too large', { status: 413 })
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': ctype,
        'cache-control': 'public, max-age=86400, immutable',
      },
    })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Proxy failed', {
      status: 502,
    })
  }
}
