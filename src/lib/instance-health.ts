/**
 * Q1.4 — shared Piped instance probe store.
 * Extracted from /api/instances so /api/health can read the SAME ring
 * buffers (and optionally trigger fresh probes) without duplicating state.
 */
import { PIPED_INSTANCES } from '@/lib/piped'

const HISTORY_LIMIT = 40 // per instance, in-memory

export interface ProbeSample {
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

export async function probe(base: string): Promise<{ ok: boolean; latencyMs: number }> {
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

export interface InstanceHealthRow {
  name: string
  url: string
  ok: boolean
  latencyMs: number
  avgLatencyMs: number
  uptimePct: number
  checks: number
  history: Array<{ t: number; ok: boolean; ms: number | null }>
  preferred: boolean
}

function summarize(base: string, ok: boolean, latencyMs: number, preferred: string): InstanceHealthRow {
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
}

/** Probe every instance live, record samples, return the summarized map. */
export async function probeAllInstances(preferred: string): Promise<InstanceHealthRow[]> {
  return Promise.all(
    PIPED_INSTANCES.map(async (base) => {
      const { ok, latencyMs } = await probe(base)
      recordSample(base, { t: Date.now(), ok, latencyMs })
      return summarize(base, ok, latencyMs, preferred)
    })
  )
}

/** No-network snapshot from the stored ring buffers (cheap, for /api/health). */
export function getInstanceHealthSnapshot(preferred: string): InstanceHealthRow[] {
  return PIPED_INSTANCES.map((base) => {
    const history = healthStore.get(base) ?? []
    const last = history[history.length - 1]
    return summarize(base, last ? last.ok : false, last ? last.latencyMs : 0, preferred)
  })
}
