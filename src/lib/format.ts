export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatViews(views?: number): string {
  if (!views || views <= 0) return ''
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B views`
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`
  return `${views} views`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)}${units[i]}`
}

export interface LrcLine {
  time: number // seconds
  text: string
}

/** Parse LRC format synced lyrics into timed lines (sorted) */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = []
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  for (const raw of lrc.split('\n')) {
    const matches = [...raw.matchAll(re)]
    if (matches.length === 0) continue
    const text = raw.replace(re, '').trim()
    for (const m of matches) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0
      lines.push({ time: min * 60 + sec + frac / 1000, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

export function greeting(): string {
  // English keys — localized via the i18n dictionary (Day 43).
  const h = new Date().getHours()
  if (h >= 4 && h < 12) return 'Good morning'
  if (h >= 12 && h < 16) return 'Good afternoon'
  if (h >= 16 && h < 19) return 'Good evening'
  if (h >= 19 && h < 22) return 'Good night'
  return 'Good night'
}

export function cnSafe(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/** Convert title "Song (Official Video) [HD]" → clean search tokens */
export function cleanTitle(title: string): string {
  return title
    .replace(/\((?:[^()]*(?:official|video|audio|lyric|lyrics|hd|hq|mv|visualizer|remix|full)[^()]*)\)/gi, '')
    .replace(/\[(?:[^\[\]]*(?:official|video|audio|lyric|lyrics|hd|hq|4k|mv)[^\[\]]*)\]/gi, '')
    .replace(/\s*[-–]\s*(official|lyric|audio|video|hd|hq|4k).*$/i, '')
    .replace(/\|.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
