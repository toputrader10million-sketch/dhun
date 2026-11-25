import { create } from 'zustand'

/**
 * Q1.3 — client-side degraded-upstream notices.
 *
 * Content routes attach a `degraded` field to responses when they served
 * stale cache because an upstream circuit breaker was open. Views funnel
 * that into this store; AppShell renders one honest amber banner while the
 * notice is fresh (90s). Multiple notices collapse into the newest one.
 */

export interface DegradedPayload {
  upstream: string
  notice: string
}

interface DegradedState {
  current: (DegradedPayload & { at: number }) | null
  mark: (payload: DegradedPayload | undefined | null) => void
  clear: () => void
}

const NOTICE_TTL_MS = 90_000

let clearTimer: ReturnType<typeof setTimeout> | null = null

export const useDegraded = create<DegradedState>((set) => ({
  current: null,
  mark: (payload) => {
    if (!payload || typeof payload.upstream !== 'string' || !payload.upstream) return
    if (clearTimer) clearTimeout(clearTimer)
    set({ current: { ...payload, at: Date.now() } })
    clearTimer = setTimeout(() => set({ current: null }), NOTICE_TTL_MS)
  },
  clear: () => {
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = null
    set({ current: null })
  },
}))

/** Pull `degraded` off a fetch response body and record it (one-liner for views). */
export function reportDegraded(body: unknown): void {
  if (body && typeof body === 'object' && 'degraded' in body) {
    const d = (body as { degraded?: unknown }).degraded
    if (d && typeof d === 'object' && typeof (d as { upstream?: unknown }).upstream === 'string') {
      useDegraded.getState().mark(d as DegradedPayload)
    }
  }
}
