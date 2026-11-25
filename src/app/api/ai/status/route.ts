import { NextResponse } from 'next/server'
import { pingLLMCached } from '@/lib/ai-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Day 24 — Phase C review: honest AI health probe.
 * Pings the LLM with a 1-token completion (cached 3 min) so the Network
 * dashboard can show whether the AI features (Copilot, NL search, AI
 * playlists, Daily Mix planner) are actually live — not just "assumed up".
 * Q1.4: the ping logic moved to src/lib/ai-status.ts; /api/health reuses it.
 */
export async function GET() {
  const out = await pingLLMCached()
  return NextResponse.json(out)
}
