'use client'
/* Dhun — AI playlist builder (Day 19).
 * Prompt → LLM-composed track spec → resolve each spec against the free
 * catalog → save as a real playlist in the user's library.
 * Honest progress UI: composing → resolving (x/N) → saving. */
import { useRef, useState } from 'react'
import { Loader2, Sparkles, CheckCircle2, XCircle, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import type { MusicItem } from '@/lib/types'
import { useLibrary } from '@/store/library'
import { useSettings as useSettingsStore } from '@/store/settings'
import { useProSheet } from '@/components/premium/pro-sheet'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface PlaylistSpec {
  name: string
  description: string
  tracks: Array<{ title: string; artist: string }>
  source: 'ai' | 'search'
}

type Phase = 'idle' | 'composing' | 'resolving' | 'saving' | 'done' | 'failed'

const EXAMPLES = [
  'Bangla romantic evening',
  'Gym pump-up bangers',
  'Late night lo-fi coding',
  '90s road trip classics',
  'Rainy day acoustic',
]

const RESOLVE_CONCURRENCY = 4

/** Day 52 — trigger for the builder: opens the Pro sheet when not unlocked. */
function GateTrigger({ onPro }: { onPro: () => void }) {
  const t = useT()
  const premium = useSettingsStore((s) => s.premium)
  const openSheet = useProSheet((s) => s.openSheet)
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full gap-1.5"
      onClick={() => (premium ? onPro() : openSheet('ai-playlist'))}
    >
      <Sparkles className="h-4 w-4 text-primary" /> {t('AI playlist')}
      {!premium && <Crown className="h-3 w-3 fill-current text-amber-500" aria-hidden />}
    </Button>
  )
}

export function AiPlaylistDialog({ onCreated }: { onCreated?: (playlistId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ resolved: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const busy = phase === 'composing' || phase === 'resolving' || phase === 'saving'
  const canceledRef = useRef(false)

  const reset = () => {
    setPhase('idle')
    setProgress({ resolved: 0, total: 0 })
    setError(null)
    canceledRef.current = false
  }

  /** Resolve a spec {title, artist} against the free catalog (first PLAYABLE match).
   * Skip live recordings / mixes / jukeboxes — the embed player can't play many
   * of those, which would burn through the queue's consecutive-error budget. */
  const resolveOne = async (track: { title: string; artist: string }): Promise<MusicItem | null> => {
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(`${track.title} ${track.artist}`)}&filter=music_songs`,
        { signal: AbortSignal.timeout(12000) }
      )
      if (!res.ok) return null
      const data = (await res.json()) as { items?: MusicItem[] }
      const bad = /(live|concert|mix|megamix|jukebox|full album|slowed|reverb|8d|karaoke|instrumental karaoke|nightcore|reaction)/i
      const items = (data.items ?? []).filter(
        (it) =>
          it.id &&
          (it.duration === 0 || (it.duration >= 60 && it.duration <= 900)) &&
          !bad.test(it.title)
      )
      return items[0] ?? null
    } catch {
      return null
    }
  }

  const build = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    canceledRef.current = false
    setError(null)
    setPhase('composing')
    let spec: PlaylistSpec | null = null
    try {
      const res = await fetch('/api/ai/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error || 'The AI composer did not respond')
      }
      spec = (await res.json()) as PlaylistSpec
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Composing failed')
      setPhase('failed')
      return
    }

    // Resolve the spec against the catalog with bounded concurrency
    setPhase('resolving')
    setProgress({ resolved: 0, total: spec.tracks.length })
    const items: MusicItem[] = []
    const queue = [...spec.tracks]
    const worker = async () => {
      while (queue.length > 0 && !canceledRef.current) {
        const track = queue.shift()
        if (!track) return
        const item = await resolveOne(track)
        if (item) items.push(item)
        setProgress((p) => ({ ...p, resolved: Math.min(p.total, p.resolved + 1) }))
      }
    }
    await Promise.all(
      Array.from({ length: RESOLVE_CONCURRENCY }, () => worker())
    )
    if (canceledRef.current) {
      reset()
      return
    }

    if (items.length === 0) {
      setError('No tracks could be resolved for this prompt — try describing it differently.')
      setPhase('failed')
      return
    }

    // Save as a real playlist
    setPhase('saving')
    const library = useLibrary.getState()
    const playlistId = await library.createPlaylist(spec.name, spec.description)
    if (!playlistId) {
      setError('Could not save the playlist')
      setPhase('failed')
      return
    }
    for (const item of items) {
      if (canceledRef.current) return
      await library.addToPlaylist(playlistId, spec.name, item)
    }
    setPhase('done')
    toast.success(`“${spec.name}” ready`, {
      description: `${items.length} tracks added${spec.source === 'ai' ? ' · composed by Dhun AI' : ''}`,
    })
    onCreated?.(playlistId)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v && !busy) reset()
        if (!v && busy) canceledRef.current = true
      }}
    >
      {/* Day 52 — AI playlist builder is a Pro surface: the trigger opens the
          honest upsell sheet for free users, the builder dialog for Pro. */}
      <GateTrigger onPro={() => setOpen(true)} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI playlist builder
          </DialogTitle>
          <DialogDescription>
            Describe the vibe — Dhun AI composes a 25-track playlist and saves it to your library.
          </DialogDescription>
        </DialogHeader>

        {phase === 'idle' || phase === 'failed' ? (
          <>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. bangla romantic songs for a rainy night"
              aria-label="Playlist prompt"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void build()
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="rounded-full bg-accent px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}
            <Button disabled={!prompt.trim()} onClick={() => void build()} className="gap-1.5">
              <Sparkles className="h-4 w-4" /> Compose playlist
            </Button>
          </>
        ) : (
          <div className="space-y-3 py-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {phase === 'composing' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Composing from your prompt…
                </>
              )}
              {phase === 'resolving' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Finding tracks in the catalog…
                </>
              )}
              {phase === 'saving' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Saving to your library…
                </>
              )}
              {phase === 'done' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Playlist ready
                </>
              )}
            </p>
            {(phase === 'resolving' || phase === 'saving') && (
              <>
                <Progress value={(progress.resolved / Math.max(1, progress.total)) * 100} />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {progress.resolved}/{progress.total} tracks matched
                </p>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                canceledRef.current = true
                setOpen(false)
              }}
            >
              {phase === 'done' ? 'Close' : 'Cancel'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
