import { NextResponse } from 'next/server'
import { PIPED_INSTANCES, getPreferredInstance } from '@/lib/piped'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HISTORY_LIMIT = 40 // per instance, in-memory

interface ProbeSample {
  t: number
  ok: boolean
  latencyMs: number
}

// In-memory health history — survives HMR via globalThis, resets on restart.
const globalForHealth = globalThis as unknown as {
  __dhunInstanceHealth?: Map<string, ProbeSample[]>
}
const healthStore: Map<string, ProbeSample[]> =
  globalForHealth.__dhunInstanceHealth ?? new Map()
globalForHealth.__dhunInstanceHealth = healthStore

function recordSample(base: string, sample: ProbeSample) {
  const arr = healthStore.get(base) ?? []
  arr.push(sample)
  if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT)
  healthStore.set(base, arr)
}

async function probe(base: string): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`${base}/search?q=test&filter=music_songs`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    const latencyMs = Date.now() - start
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { ok: true, latencyMs }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString()
  const preferred = getPreferredInstance()

  const instances = await Promise.all(
    PIPED_INSTANCES.map(async (base) => {
      const { ok, latencyMs } = await probe(base)
      recordSample(base, { t: Date.now(), ok, latencyMs })

      const history = healthStore.get(base) ?? []
      const last20 = history.slice(-20)
      const okCount = last20.filter((s) => s.ok).length
      const okLatencies = last20.filter((s) => s.ok).map((s) => s.latencyMs)
      const avgLatencyMs =
        okLatencies.length > 0
          ? Math.round(okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length)
          : 0

      return {
        name: base.replace(/^https?:\/\//, ''),
        url: base,
        ok,
        latencyMs,
        avgLatencyMs,
        uptimePct: last20.length > 0 ? Math.round((okCount / last20.length) * 100) : ok ? 100 : 0,
        checks: history.length,
        // compact sparkline payload: latency (ms, null when failed)
        history: history.slice(-24).map((s) => ({ t: s.t, ok: s.ok, ms: s.ok ? s.latencyMs : null })),
        preferred: base === preferred,
      }
    })
  )

  return NextResponse.json({ checkedAt, preferred, instances })
}
