import { db } from '@/lib/db'

/**
 * Day 34/37 — lazy table bootstrap for schema additions.
 *
 * Prisma `db push` can only be run from a machine with the Turso token; the
 * production database is updated lazily instead: the first API call that needs
 * a new table ensures it exists with idempotent DDL that mirrors schema.prisma
 * exactly. On local SQLite (already pushed) this is a no-op. Runs once per
 * server instance; failures are surfaced so routes can degrade honestly.
 */

let bootstrapPromise: Promise<boolean> | null = null

const DDL: string[] = [
  // Day 32 — cross-device queue handoff snapshots. D58: added to the lazy
  // bootstrap — Turso databases seeded from the early schema.sql lack this
  // table (Prisma db push can't run against Turso without the token), which
  // made /api/sync/queue 500 in production. Mirrors schema.prisma exactly.
  `CREATE TABLE IF NOT EXISTS "QueueHandoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fromDevice" TEXT NOT NULL DEFAULT 'Unknown device',
    "trackIndex" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "repeat" TEXT NOT NULL DEFAULT 'off',
    "items" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "QueueHandoff_userId_createdAt_idx" ON "QueueHandoff"("userId", "createdAt")`,
  // Day 34 — public read-only playlist share links
  `CREATE TABLE IF NOT EXISTS "PlaylistShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistShare_token_key" ON "PlaylistShare"("token")`,
  `CREATE INDEX IF NOT EXISTS "PlaylistShare_playlistId_idx" ON "PlaylistShare"("playlistId")`,
  // Day 37 — anonymous aggregate reactions
  `CREATE TABLE IF NOT EXISTS "Reaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'yt',
    "title" TEXT NOT NULL DEFAULT '',
    "artist" TEXT NOT NULL DEFAULT '',
    "artwork" TEXT,
    "region" TEXT NOT NULL DEFAULT 'GLOBAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "Reaction_trackId_idx" ON "Reaction"("trackId")`,
  `CREATE INDEX IF NOT EXISTS "Reaction_createdAt_idx" ON "Reaction"("createdAt")`,
]

export function ensureNewTables(): Promise<boolean> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        for (const sql of DDL) {
          await db.$executeRawUnsafe(sql)
        }
        return true
      } catch (err) {
        console.error('[db-bootstrap] failed:', err)
        bootstrapPromise = null // allow a retry on the next request
        return false
      }
    })()
  }
  return bootstrapPromise
}
