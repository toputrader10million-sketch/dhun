import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cacheGet, cacheSet } from '@/lib/piped'
import { ytWebSearch, ytMusicSearch } from '@/lib/ytmusic'
import type { HomeResponse, HomeSection, MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 30 * 60 * 1000

/* Evergreen region sections (unchanged core) */
const REGION_SECTIONS: Array<{ title: string; query: string }> = [
  { title: 'Global Hits', query: 'english top hits 2025' },
  { title: 'Chill Lo-fi', query: 'lofi chill songs' },
]

/* Day-20 smart sections: chosen by the user's LOCAL hour so the feed matches
 * how they use the app — morning energy, afternoon focus, evening vibes,
 * late-night calm. */
const DAYPARTS: Array<{
  until: number // hour < until
  sections: Array<{ title: string; query: string }>
}> = [
  {
    until: 5,
    sections: [
      { title: 'Late Night Calm', query: 'late night chill songs' },
      { title: 'Sleep Sounds', query: 'sleep soft music' },
    ],
  },
  {
    until: 12,
    sections: [
      { title: 'Morning Energy', query: 'morning fresh happy songs' },
      { title: 'Wake Up Mix', query: 'wake up morning vibes songs' },
    ],
  },
  {
    until: 17,
    sections: [
      { title: 'Afternoon Focus', query: 'focus study instrumental songs' },
      { title: 'Afternoon Refresh', query: 'refreshing afternoon songs' },
    ],
  },
  {
    until: 22,
    sections: [
      { title: 'Evening Vibes', query: 'evening chill vibes songs' },
      { title: 'Sunset Melodies', query: 'sunset golden hour songs' },
    ],
  },
  {
    until: 24,
    sections: [
      { title: 'Night Wind-down', query: 'relaxing night songs' },
      { title: 'Late Night Lo-fi', query: 'lofi night beats' },
    ],
  },
]

function daypartFor(hour: number) {
  return DAYPARTS.find((dp) => hour < dp.until) ?? DAYPARTS[4]
}

async function fetchSection(query: string): Promise<MusicItem[]> {
  try {
    // Primary: InnerTube
    const { items } = await ytWebSearch(query)
    return items
      .filter((it) => (it.duration === 0 || (it.duration >= 60 && it.duration <= 900)) && it.id)
      .slice(0, 20)
  } catch {
    // Fallback: music search, then legacy Piped
    try {
      return (await ytMusicSearch(query))
        .filter((it) => (it.duration === 0 || (it.duration >= 60 && it.duration <= 900)) && it.id)
        .slice(0, 20)
    } catch {
      try {
        const data = await fetchPiped<{ items?: Array<Record<string, unknown>> }>(
          `/search?q=${encodeURIComponent(query)}&filter=music_songs`
        )
        return (data.items ?? [])
          .map(parseStreamItem)
          .filter((it) => it.duration >= 60 && it.duration <= 600 && it.id)
          .slice(0, 20)
      } catch {
        return []
      }
    }
  }
}

/* Weather-aware extra section (Day 20) — server derives the query so the
 * client stays thin. rain → rainy melodies, snow → cozy, clear → sunny hits. */
const WEATHER_SECTIONS: Record<string, { title: string; query: string }> = {
  rain: { title: 'Rainy Day Melodies', query: 'rainy day cozy songs' },
  storm: { title: 'Storm Mode', query: 'moody atmospheric songs' },
  snow: { title: 'Snow Day Warmth', query: 'cozy winter songs' },
  clear: { title: 'Sunny Hits', query: 'sunny happy songs' },
  cloudy: { title: 'Soft Cloudy Picks', query: 'mellow soft pop songs' },
  fog: { title: 'Misty Moods', query: 'ambient calm songs' },
}

export async function GET(req: NextRequest) {
  const region = (req.nextUrl.searchParams.get('region') ?? 'IN').trim() || 'IN'
  const hourParam = Number(req.nextUrl.searchParams.get('hour'))
  const hour = Number.isInteger(hourParam) && hourParam >= 0 && hourParam < 24 ? hourParam : 12
  const weather = (req.nextUrl.searchParams.get('weather') ?? '').toLowerCase()

  const cacheKey = `home:${region}:${hour}:${weather}`
  const cached = cacheGet<HomeResponse>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const planned: Array<{ title: string; query: string }> = []
  const regionSpecific: Record<string, Array<{ title: string; query: string }>> = {
    BD: [
      { title: 'Bengali Hits', query: 'bengali latest hits songs' },
      { title: 'Bangla Classics', query: 'bangla classic songs' },
    ],
    IN: [
      { title: 'Bollywood Top', query: 'bollywood top hits' },
      { title: 'Punjabi Beats', query: 'punjabi hits songs' },
    ],
    PK: [{ title: 'Pakistani Hits', query: 'pakistani top songs' }],
    JP: [{ title: 'J-Pop Now', query: 'jpop hits songs' }],
    DE: [{ title: 'German Charts', query: 'deutsche hits top songs' }],
    US: [{ title: 'US Top Hits', query: 'usa top hits this week' }],
    GB: [{ title: 'UK Top Hits', query: 'uk top hits this week' }],
  }
  planned.push(...(regionSpecific[region] ?? []))
  planned.push(...daypartFor(hour).sections)
  planned.push(...REGION_SECTIONS)
  const weatherSection = WEATHER_SECTIONS[weather]
  if (weatherSection && weather !== 'clear') {
    planned.unshift(weatherSection) // rain outside? lead with the matching mood
  }

  // Fetch in parallel, cap at 6 sections to keep the home page fast.
  const selected = planned.slice(0, 6)
  const results = await Promise.allSettled(
    selected.map(async (s) => ({ title: s.title, items: await fetchSection(s.query) }))
  )
  const sections: HomeSection[] = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { title: selected[i].title, items: [] }
  )

  const out: HomeResponse = { sections }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
