import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheStats, getPreferredInstance } from '@/lib/piped'
import { registerBreaker, getBreakerSnapshots } from '@/lib/circuit-breaker'
import { getInstanceHealthSnapshot, probeAllInstances } from '@/lib/instance-health'
import { pingLLMCached } from '@/lib/ai-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Q1.4 — the self-host health beacon: ONE honest place for operators.
 *
 * GET /api/health        → cheap snapshot (db ping, cache hit-rate, breaker
 *                          states, last-known instance probes, cached AI ping)
 * GET /api/health?probe=1 → also live-probes every Piped instance (slower)
 *
 * Machine-readable; pairs with the Network dashboard's System health card.
 * Never throws — every subsystem degrades independently into the payload.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const liveProbe = url.searchParams.get('probe') === '1'

  // Make sure canonical breakers appear even before their first call.
  for (const name of [
    'piped',
    'ytmusic',
    'audius',
    'streams',
    'lrclib',
    'chartlyrics',
    'itunes',
    'openmeteo',
    'jamendo',
    'llm',
    'oembed',
  ]) {
    registerBreaker(name)
  }

  const started = Date.now()
  let dbOk = false
  let dbLatencyMs = 0
  let dbError: string | null = null
  try {
    const t = Date.now()
    await db.$queryRaw`SELECT 1`
    dbOk = true
    dbLatencyMs = Date.now() - t
  } catch (err) {
    dbError = err instanceof Error ? err.message.slice(0, 160) : 'unknown db error'
  }

  const preferred = getPreferredInstance()
  const [instances, ai] = await Promise.all([
    liveProbe ? probeAllInstances(preferred) : Promise.resolve(getInstanceHealthSnapshot(preferred)),
    pingLLMCached().catch(() => ({
      llm: 'down' as const,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    })),
  ])

  const breakers = getBreakerSnapshots()
  const openBreakers = breakers.filter((b) => b.status === 'open')

  return NextResponse.json({
    ok: dbOk,
    uptimeSec: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
    totalLatencyMs: Date.now() - started,
    db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError, provider: 'sqlite/libsql' },
    caches: cacheStats(),
    breakers,
    degraded: openBreakers.length > 0,
    openBreakers: openBreakers.map((b) => b.name),
    instances: {
      preferred,
      probed: liveProbe,
      count: instances.length,
      healthy: instances.filter((i) => i.ok).length,
      rows: instances,
    },
    ai,
  })
}
