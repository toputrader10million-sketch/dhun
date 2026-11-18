import { NextRequest, NextResponse } from 'next/server'
import { cacheGet, cacheSet } from '@/lib/piped'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 10 * 60 * 1000

export interface NlPlan {
  /** One-line human interpretation shown in the UI ("Bangla romantic songs for a rainy evening"). */
  interpretation: string
  /** 1–3 concrete search queries executed against the catalog. */
  queries: string[]
  /** Mood/genre chips the user can tap to refine. */
  chips: string[]
  /** 'ai' = LLM planner, 'rules' = offline heuristic planner. */
  source: 'ai' | 'rules'
}

/* ---------- offline heuristic planner (fallback, zero dependencies) ---------- */

const MOOD_MAP: Array<{ re: RegExp; label: string; query: string; chip?: string }> = [
  { re: /rain|বৃষ্টি|barsha|monsoon/i, label: 'rainy', query: 'rainy day songs' },
  { re: /sad|dolor|kanna|কান্না|বেদনা|heartbreak|breakup|alone/i, label: 'sad', query: 'sad emotional songs' },
  { re: /happy|celebrat|beshi khushi|anondo|আনন্দ|joy/i, label: 'happy', query: 'happy feel good songs' },
  { re: /romantic|love|priyo|ভালোবাসা|bhalobasha/i, label: 'romantic', query: 'romantic love songs' },
  { re: /workout|gym|energy|pump|run/i, label: 'workout', query: 'workout energy songs' },
  { re: /chill|relax|shanti|শান্তি|calm/i, label: 'chill', query: 'chill relaxing songs' },
  { re: /sleep|bunk|ghum|ঘুম|night|রাত|late/i, label: 'night', query: 'sleep lofi night songs' },
  { re: /focus|study|work|pore|পড়|concentrat|coding/i, label: 'focus', query: 'focus study instrumental music' },
  { re: /party|dance|dj|floor/i, label: 'party', query: 'party dance hits' },
  { re: /drive|road trip|gaari|car/i, label: 'drive', query: 'road trip driving songs' },
]

const LANG_MAP: Array<{ re: RegExp; label: string; query: string }> = [
  { re: /bangla|bengali|বাংলা|বাঙালি/i, label: 'Bangla', query: 'bangla songs' },
  { re: /hindi|bollywood|বলিউড/i, label: 'Bollywood', query: 'bollywood songs' },
  { re: /punjabi/i, label: 'Punjabi', query: 'punjabi songs' },
  { re: /english|western|global/i, label: 'English', query: 'english top songs' },
  { re: /arabic|urdu|islamic|naat|hamd/i, label: 'Urdu/Arabic', query: 'urdu songs' },
  { re: /lofi|lo-fi/i, label: 'Lo-Fi', query: 'lofi beats' },
]

function planWithRules(rawQuery: string): NlPlan {
  const q = rawQuery.trim()
  const moods = MOOD_MAP.filter((m) => m.re.test(q))
  const langs = LANG_MAP.filter((m) => m.re.test(q))
  const timeMood = /\bmorning|সকাল/i.test(q)
    ? 'morning'
    : /\bevening|সন্ধ্যা/i.test(q)
      ? 'evening'
      : null

  const queries: string[] = []
  const chipSet = new Set<string>()

  const baseLang = langs[0]?.query ?? ''
  const moodQuery = moods[0]?.query ?? ''

  if (moodQuery && baseLang) queries.push(`${baseLang} ${moodQuery}`)
  if (moodQuery && !baseLang) queries.push(moodQuery)
  if (!moodQuery && baseLang) queries.push(`${baseLang} popular songs`)
  if (moods[1]) {
    queries.push(`${baseLang ? baseLang + ' ' : ''}${moods[1].query}`)
    chipSet.add(moods[1].label)
  }
  if (timeMood) queries.push(`${timeMood} ${moodQuery || 'songs'}`)
  if (queries.length === 0) queries.push(q) // treat the raw text as a direct search

  for (const m of moods) chipSet.add(m.label)
  for (const l of langs) chipSet.add(l.label)
  if (chipSet.size === 0) {
    chipSet.add('chill')
    chipSet.add('popular')
  }

  const moodLabel = moods[0]?.label
  const langLabel = langs[0]?.label
  const interpretation =
    [langLabel, moodLabel && `${moodLabel} mood`, 'music'].filter(Boolean).join(' · ') ||
    `Search: “${q}”`

  return {
    interpretation,
    queries: queries.slice(0, 3),
    chips: [...chipSet].slice(0, 5),
    source: 'rules',
  }
}

/* ---------- LLM planner (z-ai-web-dev-sdk, backend only) ---------- */

async function planWithLLM(rawQuery: string): Promise<NlPlan | null> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You are the search planner for Dhun, a music app. The user describes music in natural language ' +
            '(any language: Bangla, English, Hindi…). Return ONLY valid JSON (no markdown) shaped as: ' +
            '{"interpretation": "<one short line in the user\'s language summarizing what they want>", ' +
            '"queries": ["1-3 youtube music search queries, mixing artist/genre/mood keywords", ...], ' +
            '"chips": ["3-5 short mood/genre tags like romantic, lofi, 90s"]}. ' +
            'Queries must work on YouTube Music search. Keep each query under 8 words.',
        },
        { role: 'user', content: rawQuery },
      ],
      thinking: { type: 'disabled' },
    })
    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) return null
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonText) as Partial<NlPlan>
    const queries = (parsed.queries ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3)
    if (queries.length === 0) return null
    const chips = (parsed.chips ?? []).filter((c) => typeof c === 'string' && c.trim()).slice(0, 5)
    return {
      interpretation: parsed.interpretation?.trim() || `Music: “${rawQuery}”`,
      queries,
      chips: chips.length > 0 ? chips : ['popular'],
      source: 'ai',
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { query?: string }
    const query = (body.query ?? '').trim()
    if (!query) {
      return NextResponse.json({ error: 'Missing "query"' }, { status: 400 })
    }

    const cacheKey = `nl-search:${query.toLowerCase()}`
    const cached = cacheGet<NlPlan>(cacheKey)
    if (cached) return NextResponse.json(cached)

    // LLM first (better multilingual understanding); rules planner as the
    // guaranteed fallback so the feature degrades gracefully offline.
    const plan = (await planWithLLM(query)) ?? planWithRules(query)

    cacheSet(cacheKey, plan, TTL)
    return NextResponse.json(plan)
  } catch (err) {
    const body = (await req.json().catch(() => ({}))) as { query?: string }
    const plan = body.query ? planWithRules(body.query) : null
    if (plan) return NextResponse.json(plan)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Planner failed' },
      { status: 500 }
    )
  }
}
