import { NextResponse } from 'next/server'
import { cacheGet, cacheSet } from '@/lib/piped'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Day 24 — Phase C review: honest AI health probe.
 * Pings the LLM with a 1-token completion (cached 3 min) so the Network
 * dashboard can show whether the AI features (Copilot, NL search, AI
 * playlists, Daily Mix planner) are actually live — not just "assumed up".
 */
const TTL = 3 * 60 * 1000

export async function GET() {
  const cached = cacheGet<{ llm: 'up' | 'down'; latencyMs: number; checkedAt: string }>('ai:status')
  if (cached) return NextResponse.json(cached)

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

  const out = {
    llm,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  }
  cacheSet('ai:status', out, TTL)
  return NextResponse.json(out)
}
