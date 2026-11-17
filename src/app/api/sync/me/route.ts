import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser, getUserCounts, serializeUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → current user + library counts (provisions the dhun_uid cookie on first call)
export async function GET() {
  try {
    const user = await getOrCreateUser()
    const counts = await getUserCounts(user.id)
    return NextResponse.json({ user: serializeUser(user), counts })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to resolve user' },
      { status: 500 }
    )
  }
}

// POST → ensure/refresh identity; optional { name } updates the display name
export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    let body: { name?: string } = {}
    try {
      body = (await req.json()) as { name?: string }
    } catch {
      /* empty body is fine */
    }
    if (body.name !== undefined) {
      const name = body.name.trim()
      const updated = await db.user.update({
        where: { id: user.id },
        data: { name: name || null },
      })
      const counts = await getUserCounts(user.id)
      return NextResponse.json({ user: serializeUser(updated), counts })
    }
    const counts = await getUserCounts(user.id)
    return NextResponse.json({ user: serializeUser(user), counts })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update user' },
      { status: 500 }
    )
  }
}
