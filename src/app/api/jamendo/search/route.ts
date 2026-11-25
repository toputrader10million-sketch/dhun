import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { jamendoSearch } from '@/lib/jamendo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → Jamendo CC catalog search. The client's BYO free key travels as ?key=
// (it never touches storage server-side) and is forwarded verbatim.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const key = req.nextUrl.searchParams.get('key')?.trim() || ''
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 24, 50)

  if (!q) return apiError('Missing query', { status: 400, items: [] })
  if (!key) {
    return apiError('Jamendo key required', {
      status: 400,
      code: 'key-required',
      retryable: false,
      items: [],
      reason: 'jamendo-key-required',
    })
  }

  try {
    const items = await jamendoSearch(q, limit, key)
    return NextResponse.json({ items, filter: 'music_songs' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Jamendo search failed'
    const isKeyError = msg === 'jamendo-key-required' || msg === 'jamendo-key-invalid'
    const reason = isKeyError ? msg : 'jamendo-error'
    return apiError(msg, {
      status: 400,
      code: isKeyError
        ? msg === 'jamendo-key-required'
          ? 'key-required'
          : 'key-invalid'
        : 'upstream-unavailable',
      retryable: !isKeyError,
      items: [],
      reason,
    })
  }
}
