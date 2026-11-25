import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { resolveStreams } from '@/lib/streams'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return apiError('Missing stream id', { status: 400 })

  try {
    const resolved = await resolveStreams(id)
    return NextResponse.json({
      title: resolved.title,
      duration: resolved.duration,
      audioStreams: resolved.audioStreams,
      instance: resolved.instance,
    })
  } catch (err) {
    const detail = err instanceof AggregateError
      ? err.errors.map((e) => (e instanceof Error ? e.message : String(e)))
      : [err instanceof Error ? err.message : String(err)]
    return apiError(`All Piped instances failed for /streams/${id}`, {
      status: 503,
      code: 'upstream-unavailable',
      retryable: true,
      detail,
    })
  }
}
