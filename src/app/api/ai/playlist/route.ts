import { NextRequest, NextResponse } from 'next/server'
import { ytMusicSearch } from '@/lib/ytmusic'
import { cacheGet, cacheSet } from '@/lib/piped'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 15 * 60 * 1000

export interface PlaylistSpec {
  name: string
  description: string
  /** Song specs resolved client-side against the search catalog. */
  tracks: Array<{ title: string; artist: string }>
  /** 'ai' = LLM composed, 'search' = direct catalog results for the prompt. */
  source: 'ai' | 'search'
}

/* ---------- LLM composer ---------- */
async function composeWithLLM(prompt: string): Promise<PlaylistSpec | null> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You are the playlist composer for Dhun music app. Given a user prompt in ANY language ' +
            '(Bangla, English, Hindi, vibe words, activities…), compose a cohesive playlist. ' +
            'Return ONLY valid JSON (no markdown): {"name": "<short playlist name in the user\'s language>", ' +
            '"description": "<one line>", "tracks": [{"title": "<real song title>", "artist": "<real artist>"}]}. ' +
            'Exactly 25 tracks. Use REAL, well-known songs that exist on YouTube Music. Match the prompt\'s ' +
            'language, mood and era. No repeats.',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    })
    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) return null
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonText) as {
      name?: string
      description?: string
      tracks?: Array<{ title?: string; artist?: string }>
    }
    const tracks = (parsed.tracks ?? [])
      .filter((t) => t?.title && t?.artist)
      .map((t) => ({ title: String(t.title), artist: String(t.artist) }))
      .slice(0, 25)
    if (tracks.length < 5) return null
    return {
      name: parsed.name?.trim().slice(0, 60) || 'AI Playlist',
      description: parsed.description?.trim().slice(0, 140) || `Made by Dhun AI for: ${prompt}`,
      tracks,
      source: 'ai',
    }
  } catch {
    return null
  }
}

/* ---------- heuristic fallback: real catalog search on the prompt ---------- */
async function composeFromSearch(prompt: string): Promise<PlaylistSpec | null> {
  try {
    const items = await ytMusicSearch(prompt)
    const tracks = items
      .filter((it) => it.id)
      .slice(0, 25)
      .map((it) => ({ title: it.title, artist: it.artist }))
    if (tracks.length === 0) return null
    return {
      name: prompt.length <= 40 ? `${prompt} · mix` : 'Dhun Mix',
      description: `Built from the catalog for: ${prompt}`,
      tracks,
      source: 'search',
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { prompt?: string }
    const prompt = (body.prompt ?? '').trim()
    if (!prompt) {
      return NextResponse.json({ error: 'Missing "prompt"' }, { status: 400 })
    }

    const cacheKey = `ai-playlist:${prompt.toLowerCase()}`
    const cached = cacheGet<PlaylistSpec>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const spec = (await composeWithLLM(prompt)) ?? (await composeFromSearch(prompt))
    if (!spec) {
      return NextResponse.json({ error: 'Could not compose a playlist for this prompt' }, { status: 502 })
    }

    cacheSet(cacheKey, spec, TTL)
    return NextResponse.json(spec)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Playlist composer failed' },
      { status: 500 }
    )
  }
}
