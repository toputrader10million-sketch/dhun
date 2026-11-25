import { NextResponse } from 'next/server'
import { getPreferredInstance } from '@/lib/piped'
import { probeAllInstances } from '@/lib/instance-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Q1.4 — probe state + summaries moved to src/lib/instance-health.ts so the
// /api/health beacon reads the same ring buffers. This route stays the
// "live re-test" endpoint the Network dashboard refreshes every 30s.
export async function GET() {
  const checkedAt = new Date().toISOString()
  const preferred = getPreferredInstance()
  const instances = await probeAllInstances(preferred)
  return NextResponse.json({ checkedAt, preferred, instances })
}
