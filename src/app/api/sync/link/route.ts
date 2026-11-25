import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { apiError } from '@/lib/api'
import { db } from '@/lib/db'
import { DHUN_USER_COOKIE, getUserCounts, serializeUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { code } → link this device to an existing user ("link another device").
// Finds the User by its 8-char code, sets the dhun_uid cookie, returns user+counts.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { code?: string }
    const code = (body.code ?? '').trim().toUpperCase()
    if (!code) {
      return apiError('Missing "code" in body', { status: 400 })
    }
    const user = await db.user.findUnique({ where: { code } })
    if (!user) {
      return apiError('No user with that code', { status: 404 })
    }
    const store = await cookies()
    store.set(DHUN_USER_COOKIE, user.id, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === 'production',
    })
    const counts = await getUserCounts(user.id)
    return NextResponse.json({ user: serializeUser(user), counts })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to link user', {
      status: 500,
    })
  }
}
