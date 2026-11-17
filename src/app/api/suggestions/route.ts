import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, cacheGet, cacheSet } from '@/lib/piped'

export const runtime = 'nodejs'

const TTL = 30 * 60 * 1000

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 1) return NextResponse.json({ suggestions: [] })

  const cacheKey = `suggestions:${q}`
  const cached = cacheGet<string[]>(cacheKey)
  if (cached) return NextResponse.json({ suggestions: cached })

  try {
    const data = await fetchPiped<string[]>(
      `/suggestions?endpoint=search&query=${encodeURIComponent(q)}`
    )
    const suggestions = Array.isArray(data) ? data.filter((s) => typeof s === 'string') : []
    cacheSet(cacheKey, suggestions, TTL)
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
