import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Day 45 — thin metadata resolver for protocol-handler deep links.
 * YouTube oEmbed is a lightweight public endpoint (unlike innertube/Piped it
 * is not subject to datacenter-IP blocking), so we can resolve a bare video
 * id into {title, author} server-side with a strict timeout.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const yt = searchParams.get('yt') ?? ''
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(yt)) {
    return NextResponse.json({ error: 'bad-id' }, { status: 400 })
  }
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${yt}`
    )}&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(String(res.status))
    const d = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    return NextResponse.json(
      { title: d.title ?? null, author: d.author_name ?? null, thumb: d.thumbnail_url ?? null },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    )
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}
