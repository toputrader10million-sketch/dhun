import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, cacheGet, cacheSet, cacheGetStale } from '@/lib/piped'
import { ytSuggestions } from '@/lib/ytmusic'
import { openBreaker, degradedNotice, UPSTREAM_LABELS } from '@/lib/resilient'

export const runtime = 'nodejs'

const TTL = 30 * 60 * 1000

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 1) return NextResponse.json({ suggestions: [] })

  const cacheKey = `suggestions:${q}`
  const cached = cacheGet<string[]>(cacheKey)
  if (cached) return NextResponse.json({ suggestions: cached })

  let suggestions: string[] = []
  // Primary: Google suggest endpoint (keyless, datacenter-safe)
  suggestions = await ytSuggestions(q)
  // Fallback: Piped (legacy)
  if (suggestions.length === 0) {
    try {
      const data = await fetchPiped<string[]>(
        `/suggestions?endpoint=search&query=${encodeURIComponent(q)}`
      )
      if (Array.isArray(data)) suggestions = data.filter((s) => typeof s === 'string')
    } catch {
      /* fall through with empty */
    }
  }
  // Q1.3 — empty suggestions + open breaker → stale cache (don't cache empty).
  if (suggestions.length === 0) {
    const open = openBreaker(['ytmusic', 'piped'])
    if (open) {
      const stale = cacheGetStale<string[]>(cacheKey)
      const degraded = degradedNotice(UPSTREAM_LABELS[open] ?? open)
      if (stale && stale.length > 0) return NextResponse.json({ suggestions: stale, degraded })
      return NextResponse.json({ suggestions, degraded })
    }
  }
  cacheSet(cacheKey, suggestions, TTL)
  return NextResponse.json({ suggestions })
}
