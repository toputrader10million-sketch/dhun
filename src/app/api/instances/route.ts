import { NextResponse } from 'next/server'
import { PIPED_INSTANCES } from '@/lib/piped'
import type { InstanceStatus } from '@/lib/types'

export const runtime = 'nodejs'

async function probe(base: string): Promise<InstanceStatus> {
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
    return { name: base.replace(/^https?:\/\//, ''), url: base, ok: true, latencyMs }
  } catch {
    return {
      name: base.replace(/^https?:\/\//, ''),
      url: base,
      ok: false,
      latencyMs: Date.now() - start,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const statuses = await Promise.all(PIPED_INSTANCES.map(probe))
  return NextResponse.json({ instances: statuses })
}
