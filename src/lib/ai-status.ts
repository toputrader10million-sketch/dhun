/**
 * Q1.4 — shared LLM health probe.
 * Extracted from /api/ai/status so /api/health can report the same cached
 * ping without double-paying for it.
 */
import { cacheGet, cacheSet } from '@/lib/piped'

export interface AiStatus {
  llm: 'up' | 'down'
  latencyMs: number
  checkedAt: string
}

const TTL = 3 * 60 * 1000

/** Uncached 1-token ping (also feeds the "llm" circuit breaker). */
export async function pingLLM(): Promise<{ llm: 'up' | 'down'; latencyMs: number }> {
  const started = Date.now()
  let llm: 'up' | 'down' = 'down'
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      thinking: { type: 'disabled' },
    })
    const text = completion.choices[0]?.message?.content?.trim().toLowerCase()
    llm = text ? 'up' : 'down'
  } catch {
    llm = 'down'
  }
  return { llm, latencyMs: Date.now() - started }
}

/** Cached (3 min) status used by /api/ai/status and /api/health. */
export async function pingLLMCached(): Promise<AiStatus> {
  const cached = cacheGet<AiStatus>('ai:status')
  if (cached) return cached
  const { llm, latencyMs } = await pingLLM()
  const out: AiStatus = { llm, latencyMs, checkedAt: new Date().toISOString() }
  cacheSet('ai:status', out, TTL)
  return out
}
