import { NextRequest, NextResponse } from 'next/server'
import { ytMusicSearch } from '@/lib/ytmusic'
import { cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Day 24 tuning: identical questions (same message + track + region) resolve
// instantly from memory instead of paying the LLM + catalog round-trip again.
const COPILOT_TTL = 5 * 60 * 1000

/* ---------- Types ---------- */

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface CopilotContext {
  currentTrack?: { title?: string; artist?: string; source?: string }
  view?: string
  region?: string
}

interface CopilotPlan {
  reply: string
  /** 0–2 catalog search queries — present when the user wants music. */
  searchQueries: string[]
  /** 2–4 short follow-up suggestions for chips. */
  chips: string[]
  source: 'ai' | 'rules'
}

/* ---------- App knowledge shared with the model ---------- */

const APP_FACTS = `
Dhun is a free PWA music platform (no login, no ads). Features the user may ask about:
- Search: Explore tab searches YouTube (InnerTube), Audius (indie, direct stream), Jamendo (needs a free user key).
- AI search: typing a natural sentence ("rainy evening bangla songs") triggers the AI planner.
- Voice search: mic button in the Explore search bar (region-aware language, e.g. Bangladesh → Bangla).
- Playback: YouTube embed for most tracks; Hi-Fi mode streams direct audio when available (Settings → Audio engine); crossfade and gapless toggles in Settings → Playback.
- Downloads: download icon in the mini player / track menu caches audio for offline (works best for Audius + Hi-Fi tracks; YouTube downloads depend on the network and may be blocked).
- Sleep timer: moon/timer icon in Now Playing — presets, "stop after this track", fade-out.
- Themes: Settings → Themes (Aurora, Sunset, Forest, Neon Night, Mono Pro) + accent designer with custom gradients.
- Smart radio: "Smart radio" button in Now Playing (mood/era based).
- AI playlist: Library → "AI playlist" — describe it, get a 25-track playlist.
- Daily Mix: Home hero card, personalized from listening history.
- Charts: Charts tab (region charts, Audius trending, genres).
- Share: share button in Now Playing / track menus (share card image or text).
- Keyboard shortcuts: "?" opens the help dialog; space play/pause, arrows seek/switch track, M mute, N next, P previous.
- Queue: reorder by dragging in Now Playing → Up next; auto-mix keeps music going at queue end.
- Artist pages: tap any artist name (track rows, cards, Now Playing) — top tracks, iTunes discography (albums & singles), Audius catalog.
- EQ profiles: Settings → Equalizer — 10-band with a profile per source (All audio / YouTube / Audius / Jamendo). Audible in Hi-Fi mode and for Audius/Jamendo/offline; the YouTube embed plays flat.
- Visualizer: Settings → Playback → Now Playing visualizer (Bars/Wave/Ring) — live audio data in Hi-Fi/Audius/offline playback only.
- Smart downloads: Settings → Offline downloads — auto-caches favorites in the background with a Wi-Fi rule and a track cap.
- Playlist import/export: playlist ⋮ menu → export JSON file or copy a DHUN1 share code; Library → Import recreates it.
- Sync conflict rules: Settings → Cloud Sync → "Conflict rules" — Merge / Local wins / Cloud wins for backup imports.
- Desktop widget: Settings → Playback — floating compact player with mini spectrum (desktop).
- Handoff: Settings → "Continue on another device"; a resume toast appears automatically when another device sends you a queue.
- Region: Settings → Music region affects charts/home feed and voice language.
- Dhun Pro: a free comfort tier (no payment exists). Pro adds the theme engine beyond Midnight Rose/Mono Pro (incl. Imperial Gold), AI DJ Daily Mix playback, AI playlist builder, per-source EQ profiles, Wave/Ring visualizers and public share-links. Anyone can unlock it instantly free, or earn it: 25 plays across 3+ days mints a personal loyalty code, or sending feedback unlocks it as a thank-you. The Pro panel lives at the top of Settings with a usage dashboard. Core playback/search/playlists/lyrics/downloads stay free forever.
Answer with practical steps, be brief, and never invent features that are not listed.`

/* ---------- LLM planner ---------- */

async function planWithLLM(
  message: string,
  history: ChatTurn[],
  context: CopilotContext
): Promise<Omit<CopilotPlan, 'source'> | null> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()

    const ctxLines: string[] = []
    if (context.currentTrack?.title) {
      ctxLines.push(`Now playing: "${context.currentTrack.title}" by ${context.currentTrack.artist ?? 'unknown'}`)
    }
    if (context.view) ctxLines.push(`User is on the ${context.view} tab`)
    if (context.region) ctxLines.push(`Music region: ${context.region}`)

    const messages: ChatTurn[] = [
      {
        role: 'assistant',
        content:
          'You are Dhun Copilot, the friendly in-app assistant of the Dhun music app. ' +
          APP_FACTS +
          '\nRespond in the same language the user writes in (Bangla, English, Hindi…). ' +
          'Return ONLY valid JSON (no markdown) shaped as: ' +
          '{"reply": "<1-3 short sentences; concrete and actionable>", ' +
          '"searchQueries": ["0-2 youtube music search queries — ONLY when the user asks to find/play/hear music"], ' +
          '"chips": ["2-4 very short follow-up taps the user might want"]}. ' +
          'If the user asks for music suggestions, include 1-2 searchQueries. Otherwise searchQueries must be [].',
      },
      ...(ctxLines.length > 0
        ? [{ role: 'assistant' as const, content: `Context: ${ctxLines.join('; ')}` }]
        : []),
      ...history.slice(-8),
      { role: 'user', content: message },
    ]

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) return null
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonText) as Partial<CopilotPlan>
    if (!parsed.reply || typeof parsed.reply !== 'string') return null
    return {
      reply: parsed.reply.trim(),
      searchQueries: (parsed.searchQueries ?? [])
        .filter((q) => typeof q === 'string' && q.trim())
        .slice(0, 2),
      chips: (parsed.chips ?? []).filter((c) => typeof c === 'string' && c.trim()).slice(0, 4),
    }
  } catch {
    return null
  }
}

/* ---------- Rule-based fallback (honest, zero dependencies) ---------- */

function planWithRules(message: string): CopilotPlan {
  const q = message.toLowerCase()
  const chips = ['Play something Bangla', 'How do downloads work?', 'Change my theme', 'Sleep timer']

  if (/download|offline|save|cache/.test(q)) {
    return {
      reply:
        'Tap the download icon in the mini player (or the ⋮ menu on any track) to cache it for offline. ' +
        'Audius and Hi-Fi tracks download reliably; YouTube downloads depend on the network and may be blocked. ' +
        'Manage everything in Settings → Offline downloads.',
      searchQueries: [],
      chips,
      source: 'rules',
    }
  }
  if (/theme|dark|light|accent|color|appearance/.test(q)) {
    return {
      reply:
        'Settings → Themes has six curated looks (Aurora, Sunset, Forest, Neon Night, Mono Pro…). ' +
        'Below that, Accent color and Gradient presets restyle the whole app instantly — themes and accents combine freely.',
      searchQueries: [],
      chips,
      source: 'rules',
    }
  }
  if (/sleep|timer|night|fade/.test(q)) {
    return {
      reply:
        'Open Now Playing and tap the timer icon. You get presets, custom minutes, "stop after this track", ' +
        'and a 5-second volume fade so the music never cuts abruptly.',
      searchQueries: [],
      chips,
      source: 'rules',
    }
  }
  if (/shortcut|keyboard|hotkey/.test(q)) {
    return {
      reply:
        'Press ? for the full list: space play/pause, ←/→ seek, N next track, P previous, M mute. ' +
        'The button "Keyboard shortcuts" in the sidebar opens the same dialog.',
      searchQueries: [],
      chips,
      source: 'rules',
    }
  }
  if (/playlist|mix|radio|suggest|recommend|play something|listen/.test(q)) {
    return {
      reply:
        'I can pull up music for you right here — try "play something Bangla" or a mood like workout / lofi. ' +
        'For a deeper dive: Home → Daily Mix (personal), Library → AI playlist (prompt-based), and Now Playing → Smart radio (mood/era).',
      searchQueries: ['popular songs'],
      chips,
      source: 'rules',
    }
  }
  if (/hi-?fi|quality|crossfade|gapless|audio/.test(q)) {
    return {
      reply:
        'Settings → Audio engine lets you try Hi-Fi direct streaming (real audio, no video) when the network allows. ' +
        'The same panel has gapless playback and crossfade controls.',
      searchQueries: [],
      chips,
      source: 'rules',
    }
  }
  return {
    reply:
      "I'm Dhun Copilot — I can find music, explain any feature, and point you to the right setting. " +
      'Ask me for a mood ("focus study songs"), a language ("bangla romantic"), or help like "how do downloads work".',
    searchQueries: [],
    chips,
    source: 'rules',
  }
}

/* ---------- Catalog resolution ---------- */

async function resolveTracks(queries: string[]): Promise<MusicItem[]> {
  if (queries.length === 0) return []
  const settled = await Promise.allSettled(
    queries.slice(0, 2).map((q) => ytMusicSearch(q))
  )
  const merged: MusicItem[] = []
  const seen = new Set<string>()
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue
    for (const it of s.value) {
      const k = `${it.source ?? 'yt'}:${it.id}`
      if (seen.has(k)) continue
      seen.add(k)
      // Playability guard mirrors the AI search pipeline
      if (it.id && (it.duration === 0 || (it.duration >= 60 && it.duration <= 900))) {
        merged.push(it)
      }
    }
  }
  return merged.slice(0, 8)
}

/* ---------- Handler ---------- */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      message?: string
      history?: ChatTurn[]
      context?: CopilotContext
    }
    const message = (body.message ?? '').trim()
    if (!message) {
      return NextResponse.json({ error: 'Missing "message"' }, { status: 400 })
    }
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (t) =>
              t &&
              (t.role === 'user' || t.role === 'assistant') &&
              typeof t.content === 'string'
          )
          .slice(-8)
      : []
    const context = (body.context ?? {}) as CopilotContext

    // Cache key: exact question + immediate conversational context.
    const lastUser = [...history].reverse().find((t) => t.role === 'user')?.content ?? ''
    const cacheKey = `copilot:${message.toLowerCase()}:${lastUser.toLowerCase().slice(0, 80)}:${context.currentTrack?.title ?? ''}:${context.region ?? ''}`
    const cached = cacheGet<{ reply: string; searchQueries: string[]; chips: string[]; source: 'ai' | 'rules'; tracks: MusicItem[] }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const llm = await planWithLLM(message, history, context)
    const plan: CopilotPlan = llm
      ? { ...llm, source: 'ai' }
      : planWithRules(message)

    const tracks = await resolveTracks(plan.searchQueries)
    const out = { ...plan, tracks }
    cacheSet(cacheKey, out, COPILOT_TTL)
    return NextResponse.json(out)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Copilot failed' },
      { status: 500 }
    )
  }
}
