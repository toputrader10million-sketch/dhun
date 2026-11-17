// Lightweight device-sync identity layer — server-only.
// Resolves the current User from the `x-dhun-user` header (testing/curl) or the
// `dhun_uid` cookie; creates a new User (and adopts legacy anonymous rows) when
// neither matches. NOT for client components.
import { cookies, headers } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import type { User } from '@prisma/client'

export const DHUN_USER_COOKIE = 'dhun_uid'

// 8-char, uppercase, unambiguous (no 0/O/1/I/L)
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

const globalForUser = globalThis as unknown as {
  __dhunUserCreateInFlight?: Promise<User>
}

function generateCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

async function createUniqueUser(): Promise<User> {
  // 3 attempts against the (astronomically unlikely) code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await db.user.create({ data: { code: generateCode() } })
      await adoptLegacyRows(user.id)
      return user
    } catch (err) {
      // P2002 → unique constraint violation on code; retry with a fresh code
      const isUniqueViolation =
        typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
      if (!isUniqueViolation || attempt === 2) throw err
    }
  }
  throw new Error('Failed to create user') // unreachable
}

/** First device wins: anonymous (pre-multi-user) rows get attached to the new user. */
async function adoptLegacyRows(userId: string): Promise<void> {
  try {
    await db.favorite.updateMany({ where: { userId: null }, data: { userId } })
    await db.historyEntry.updateMany({ where: { userId: null }, data: { userId } })
    await db.playlist.updateMany({ where: { userId: null }, data: { userId } })
  } catch {
    /* best-effort: never block user creation on legacy adoption */
  }
}

/**
 * Get (or provision) the current user. Always called inside route handlers,
 * so setting the cookie via the async cookies() store works (Next 15/16).
 * When `x-dhun-user` resolves to a User, no cookie is written.
 */
export async function getOrCreateUser(): Promise<User> {
  // 1) request header takes precedence (curl / server-to-server testing)
  const hdrs = await headers()
  const headerId = hdrs.get('x-dhun-user')
  if (headerId) {
    const user = await db.user.findUnique({ where: { id: headerId } })
    if (user) return user
  }

  // 2) cookie
  const store = await cookies()
  const cookieId = store.get(DHUN_USER_COOKIE)?.value
  if (cookieId) {
    const user = await db.user.findUnique({ where: { id: cookieId } })
    if (user) return user
  }

  // 3) create new user + adopt legacy rows + set cookie.
  // A page load fires several API calls in parallel before any cookie lands;
  // share one in-flight creation promise so only ONE user is made per process.
  const inflight = globalForUser.__dhunUserCreateInFlight
  if (inflight) {
    try {
      const user = await inflight
      store.set(DHUN_USER_COOKIE, user.id, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        secure: process.env.NODE_ENV === 'production',
      })
      return user
    } catch {
      /* creation failed → fall through and retry here */
    }
  }

  const promise = createUniqueUser()
  globalForUser.__dhunUserCreateInFlight = promise
  try {
    const user = await promise
    store.set(DHUN_USER_COOKIE, user.id, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      secure: process.env.NODE_ENV === 'production',
    })
    return user
  } finally {
    if (globalForUser.__dhunUserCreateInFlight === promise) {
      delete globalForUser.__dhunUserCreateInFlight
    }
  }
}

export function serializeUser(user: User): {
  id: string
  code: string
  name: string | null
  createdAt: string
} {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function getUserCounts(userId: string): Promise<{
  favorites: number
  playlists: number
  history: number
}> {
  const [favorites, playlists, history] = await Promise.all([
    db.favorite.count({ where: { userId } }),
    db.playlist.count({ where: { userId } }),
    db.historyEntry.count({ where: { userId } }),
  ])
  return { favorites, playlists, history }
}
