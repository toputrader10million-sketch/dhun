import { NextRequest, NextResponse } from 'next/server'
import { jamendoSearch } from '@/lib/jamendo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → Jamendo CC catalog search. The client's BYO free key travels as ?key=
// (it never touches storage server-side) and is forwarded verbatim.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const key = req.nextUrl.searchParams.get('key')?.trim() || ''
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 24, 50)

  if (!q) return NextResponse.json({ items: [], error: 'Missing query' }, { status: 400 })
  if (!key) {
    return NextResponse.json(
      { items: [], error: 'Jamendo key required', reason: 'jamendo-key-required' },
      { status: 400 }
    )
  }

  try {
    const items = await jamendoSearch(q, limit, key)
    return NextResponse.json({ items, filter: 'music_songs' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Jamendo search failed'
    const reason = msg === 'jamendo-key-required' || msg === 'jamendo-key-invalid' ? msg : 'jamendo-error'
    return NextResponse.json({ items: [], error: msg, reason }, { status: 400 })
  }
}
