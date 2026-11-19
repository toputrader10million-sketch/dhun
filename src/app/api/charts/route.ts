import { NextRequest, NextResponse } from 'next/server'
import { ytMusicSearch, ytWebSearch } from '@/lib/ytmusic'
import { trendingTracks } from '@/lib/audius'
import { cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 60 * 60 * 1000

export interface ChartSection {
  title: string
  items: MusicItem[]
  source: 'yt' | 'au'
}

const REGION_LABELS: Record<string, string> = {
  BD: 'Bangladesh',
  IN: 'India',
  PK: 'Pakistan',
  US: 'US',
  GB: 'UK',
  DE: 'Germany',
  JP: 'Japan',
  GLOBAL: 'Global',
}

/* Day 35 — genre × region blending: regional flavor word for each region */
const REGION_FLAVOR: Record<string, string> = {
  BD: 'bangla',
  IN: 'indian',
  PK: 'pakistani',
  US: 'american',
  GB: 'uk',
  DE: 'german',
  JP: 'japanese',
  GLOBAL: '',
}

/* Region-curated chart queries (Day 14). Free YouTube Music search only — no
 * paid chart API. Regions mirror the app's Settings region list. */
const REGION_QUERIES: Record<string, string[]> = {
  BD: ['bangla top songs this week', 'bengali hit songs', 'bangla new song'],
  IN: ['top songs india this week', 'bollywood top hits this week', 'punjabi top songs'],
  PK: ['pakistani top songs', 'top songs pakistan this week', 'pakistani hits'],
  US: ['billboard top hits this week', 'top pop songs this week', 'top hits usa'],
  GB: ['uk top 40 this week', 'top hits uk this week', 'top pop songs uk'],
  DE: ['deutsche charts top songs', 'german top hits this week', 'top hits europe'],
  JP: ['japan top hits this week', 'jpop top songs', 'top hits asia'],
  GLOBAL: ['top songs worldwide this week', 'global top hits', 'top hits this week'],
}

/* Genre charts (YouTube curated) + Audius genre filter equivalents */
const GENRE_CHARTS: { id: string; label: string; yt: string; audius?: string }[] = [
  { id: 'pop', label: 'Pop', yt: 'pop hits top songs', audius: 'Pop' },
  { id: 'hiphop', label: 'Hip-Hop', yt: 'hip hop top songs', audius: 'Hip-Hop/Rap' },
  { id: 'electronic', label: 'Electronic', yt: 'edm top songs', audius: 'Electronic' },
  { id: 'lofi', label: 'Lo-Fi', yt: 'lofi chill beats', audius: 'Lo-Fi' },
  { id: 'bollywood', label: 'Bollywood', yt: 'bollywood top songs' },
  { id: 'bangla', label: 'Bangla', yt: 'bangla top songs' },
  { id: 'punjabi', label: 'Punjabi', yt: 'punjabi top songs' },
  { id: 'rock', label: 'Rock', yt: 'rock top songs', audius: 'Rock' },
  { id: 'rnb', label: 'R&B', yt: 'r and b top songs', audius: 'R&B/Soul' },
  { id: 'classical', label: 'Classical', yt: 'classical music top', audius: 'Classical' },
]

function clampItems(items: MusicItem[], min = 60, max = 900): MusicItem[] {
  return items
    .filter((it) => it.id && (it.duration === 0 || (it.duration >= min && it.duration <= max)))
    .slice(0, 24)
}

async function ytChartSection(title: string, query: string): Promise<ChartSection> {
  try {
    const items = await ytMusicSearch(query)
    return { title, items: clampItems(items), source: 'yt' }
  } catch {
    try {
      const web = await ytWebSearch(query)
      return { title, items: clampItems(web.items), source: 'yt' }
    } catch {
      return { title, items: [], source: 'yt' }
    }
  }
}

async function audiusSection(title: string, genre?: string): Promise<ChartSection> {
  try {
    const items = await trendingTracks(24, genre)
    return { title, items, source: 'au' }
  } catch {
    return { title, items: [], source: 'au' }
  }
}

export async function GET(req: NextRequest) {
  const region = (req.nextUrl.searchParams.get('region') ?? 'GLOBAL').toUpperCase()
  const genreId = req.nextUrl.searchParams.get('genre') ?? ''
  const mode = req.nextUrl.searchParams.get('mode') ?? 'tops' // tops | genre | audius

  const cacheKey = `charts:${region}:${genreId}:${mode}`
  const cached = cacheGet<{ sections: ChartSection[] }>(cacheKey)
  if (cached) return NextResponse.json(cached)

  let sections: ChartSection[] = []

  if (mode === 'genre') {
    const g = GENRE_CHARTS.find((x) => x.id === genreId)
    if (!g) {
      return NextResponse.json({ error: 'Unknown genre' }, { status: 400 })
    }
    /* Day 35 — blend region flavor into the genre query when a specific
     * region is chosen (e.g. BD + Pop → "bangla pop top songs"). */
    const flavor = REGION_FLAVOR[region] ?? ''
    const genreWord = g.label.toLowerCase()
    const blended = flavor && flavor !== genreWord && genreId !== 'bollywood' && genreId !== 'bangla'
    const queries = blended
      ? [`${flavor} ${genreWord} top songs`, `top ${genreWord} hits ${flavor}`]
      : [g.yt]
    const title = blended
      ? `${REGION_LABELS[region] ?? region} ${g.label} chart`
      : `${g.label} chart`
    const sectionsBuilt = await Promise.all(
      queries.map((q, i) =>
        ytChartSection(queries.length > 1 ? (i === 0 ? title : `${g.label} in ${REGION_LABELS[region] ?? region}`) : title, q)
      )
    )
    sections = sectionsBuilt
    // Every genre chart gets an Audius twin when one exists — direct-stream
    // tracks that play in Hi-Fi/offline without YouTube.
    if (g.audius) {
      sections.push(await audiusSection(`${g.label} on Audius`, g.audius))
    }
  } else if (mode === 'audius') {
    const g = GENRE_CHARTS.find((x) => x.id === genreId)
    sections = [await audiusSection(g ? `${g.label} on Audius` : 'Audius trending', g?.audius)]
  } else {
    // tops — region-curated
    const queries = REGION_QUERIES[region] ?? REGION_QUERIES.GLOBAL
    const labels: Record<string, string[]> = {
      BD: ['Bangla Top 24', 'Bengali Hits', 'Fresh Bangla'],
      IN: ['India Top 24', 'Bollywood Chart', 'Punjabi Top'],
      PK: ['Pakistan Top 24', 'Pakistani Hits', 'Fresh Picks'],
      JP: ['Japan Top 24', 'J-Pop Chart', 'Fresh Picks'],
      DE: ['Germany Top 24', 'German Chart', 'Fresh Picks'],
      US: ['US Top 24', 'Popular Now', 'Fresh Picks'],
      GB: ['UK Top 24', 'Popular Now', 'Fresh Picks'],
      GLOBAL: ['Global Top 24', 'Popular Now', 'Fresh Picks'],
    }
    const names = labels[region] ?? labels.GLOBAL
    sections = await Promise.all(
      queries.map((q, i) => ytChartSection(names[i] ?? `Chart ${i + 1}`, q))
    )
    // Append one Audius section so direct-stream tracks always have a place.
    sections.push(await audiusSection('Audius Trending'))
  }

  const out = { sections: sections.filter((s) => s.items.length > 0) }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
