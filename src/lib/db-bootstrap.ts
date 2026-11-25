import { db } from '@/lib/db'
import { GENERATED_DDL } from '@/lib/db-bootstrap.generated'

/**
 * Q1.1 — schema-driven lazy table bootstrap.
 *
 * Prisma `db push` can only be run from a machine with the Turso token; the
 * production database is updated lazily instead: the first API call that
 * needs storage ensures EVERY schema table exists with idempotent DDL
 * generated directly from prisma/schema.prisma (see scripts/gen-bootstrap.ts).
 *
 * History: the D34 hand-curated list omitted QueueHandoff → production 500
 * (Day 58). The list is now GENERATED from the schema, so a forgotten model
 * is impossible by construction. Regenerate after schema changes:
 *   bun run bootstrap:gen
 *
 * On local SQLite (already pushed) this is a no-op. Runs once per server
 * instance; failures are surfaced so routes can degrade honestly.
 */

let bootstrapPromise: Promise<boolean> | null = null

export function ensureNewTables(): Promise<boolean> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        for (const sql of GENERATED_DDL) {
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
