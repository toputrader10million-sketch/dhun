/**
 * Q1.3 — upstream circuit breakers.
 *
 * Each named upstream (piped, ytmusic, audius, lrclib, itunes, openmeteo,
 * jamendo, llm, oembed, chartlyrics) gets a breaker that opens after N
 * consecutive failures and fail-fasts for a cooldown (doubling up to a cap).
 * While open, callers must degrade (serve stale cache / honest notice)
 * instead of hammering a dead upstream — the #1 runtime risk identified in
 * PLAN-Q2 (Piped instance churn).
 *
 * State lives on globalThis so it survives dev-server HMR. Breakers never
 * add latency when healthy: the wrapper is a plain try/catch around the call.
 */

export type BreakerStatus = 'closed' | 'open' | 'half-open'

export interface BreakerSnapshot {
  name: string
  status: BreakerStatus
  consecutiveFailures: number
  openedAt: string | null // ISO, null when closed
  nextProbeAt: string | null // ISO when open/half-open pending
  lastError: string | null
  lastFailureAt: string | null
  lastSuccessAt: string | null
  totalOpens: number
  cooldownMs: number
}

interface BreakerState {
  failures: number
  openedAt: number | null
  cooldownMs: number
  probing: boolean
  lastError: string | null
  lastFailureAt: number | null
  lastSuccessAt: number | null
  totalOpens: number
}

const DEFAULT_THRESHOLD = 3
const DEFAULT_COOLDOWN_MS = 20_000
const MAX_COOLDOWN_MS = 5 * 60_000

const globalForBreakers = globalThis as unknown as {
  __dhunBreakers?: Map<string, BreakerState>
}

const breakers: Map<string, BreakerState> =
  globalForBreakers.__dhunBreakers ?? new Map<string, BreakerState>()
globalForBreakers.__dhunBreakers = breakers

function stateFor(name: string): BreakerState {
  let s = breakers.get(name)
  if (!s) {
    s = {
      failures: 0,
      openedAt: null,
      cooldownMs: DEFAULT_COOLDOWN_MS,
      probing: false,
      lastError: null,
      lastFailureAt: null,
      lastSuccessAt: null,
      totalOpens: 0,
    }
    breakers.set(name, s)
  }
  return s
}

export class BreakerOpenError extends Error {
  readonly breaker: string
  readonly retryAfterMs: number
  constructor(breaker: string, retryAfterMs: number) {
    super(`Circuit breaker "${breaker}" is open — upstream unavailable, fail-fast`)
    this.name = 'BreakerOpenError'
    this.breaker = breaker
    this.retryAfterMs = retryAfterMs
  }
}

export function isOpen(name: string): boolean {
  const s = stateFor(name)
  if (s.openedAt === null) return false
  const elapsed = Date.now() - s.openedAt
  if (elapsed >= s.cooldownMs) {
    // cooldown expired → allow one probe through (half-open)
    return false
  }
  return true
}

function onSuccess(name: string) {
  const s = stateFor(name)
  s.failures = 0
  s.openedAt = null
  s.probing = false
  s.cooldownMs = DEFAULT_COOLDOWN_MS // reset backoff on a healthy call
  s.lastSuccessAt = Date.now()
}

function onFailure(name: string, err: unknown) {
  const s = stateFor(name)
  s.failures += 1
  s.probing = false
  s.lastError = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
  s.lastFailureAt = Date.now()
  if (s.failures >= DEFAULT_THRESHOLD && s.openedAt === null) {
    s.openedAt = Date.now()
    s.totalOpens += 1
  } else if (s.openedAt !== null && s.probing === false && s.failures > DEFAULT_THRESHOLD) {
    // a half-open probe failed → re-open with doubled cooldown
    s.cooldownMs = Math.min(s.cooldownMs * 2, MAX_COOLDOWN_MS)
    s.openedAt = Date.now()
    s.totalOpens += 1
  }
}

/**
 * Run `fn` guarded by the named breaker.
 * - closed: fn runs normally; success resets, failure counts toward open.
 * - open: fn is skipped and BreakerOpenError throws immediately (fail-fast,
 *   no upstream traffic), unless the cooldown has elapsed → half-open probe.
 * Callers should catch BreakerOpenError and serve stale/honest fallbacks.
 */
export async function withBreaker<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const s = stateFor(name)
  if (isOpen(name)) {
    throw new BreakerOpenError(name, Math.max(0, s.cooldownMs - (Date.now() - (s.openedAt ?? 0))))
  }
  // mark half-open probes so a single failure re-opens with backoff
  const wasOpen = s.openedAt !== null
  if (wasOpen) s.probing = true
  try {
    const result = await fn()
    onSuccess(name)
    return result
  } catch (err) {
    onFailure(name, err)
    throw err
  }
}

/** Human-facing snapshot list for /api/health and dashboards. */
export function getBreakerSnapshots(): BreakerSnapshot[] {
  const now = Date.now()
  const names = [...breakers.keys()].sort()
  return names.map((name) => {
    const s = stateFor(name)
    const open = s.openedAt !== null && now - s.openedAt < s.cooldownMs
    const status: BreakerStatus = open ? 'open' : s.openedAt !== null ? 'half-open' : 'closed'
    return {
      name,
      status,
      consecutiveFailures: s.failures,
      openedAt: s.openedAt ? new Date(s.openedAt).toISOString() : null,
      nextProbeAt: s.openedAt ? new Date(s.openedAt + s.cooldownMs).toISOString() : null,
      lastError: s.lastError,
      lastFailureAt: s.lastFailureAt ? new Date(s.lastFailureAt).toISOString() : null,
      lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
      totalOpens: s.totalOpens,
      cooldownMs: s.cooldownMs,
    }
  })
}

/** Ensure a breaker exists in the registry (so dashboards list it up-front). */
export function registerBreaker(name: string): void {
  stateFor(name)
}
