'use client'
/** Share a track via Web Share API, falling back to clipboard copy. */
export async function shareTrack(opts: {
  title: string
  artist?: string
}): Promise<'shared' | 'copied' | 'failed'> {
  const text = `${opts.title}${opts.artist ? ' — ' + opts.artist : ''}`
  const url = typeof window !== 'undefined' ? window.location.origin : ''
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: opts.title, text, url })
      return 'shared'
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      return 'copied'
    }
    return 'failed'
  } catch (err) {
    // User dismissed the share sheet — not an error, stay silent.
    if (err instanceof Error && err.name === 'AbortError') return 'shared'
    return 'failed'
  }
}
