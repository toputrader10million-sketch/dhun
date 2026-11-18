'use client'
/* HandoffDialog — cross-device queue handoff.
 *
 * SEND: publishes the current queue (track order + index + position) to the
 * user's Turso sync account so any linked device can pick it up.
 * RESUME: lists recent handoffs from the account; "Resume here" restores the
 * queue and continues playback at the exact track + position.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Loader2,
  MonitorSmartphone,
  Play,
  Send,
  Smartphone,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { usePlayer } from '@/store/player'
import { useCast } from '@/lib/cast'
import { getDeviceLabel } from '@/lib/device'
import type { MusicItem } from '@/lib/types'

interface HandoffSummary {
  id: string
  fromDevice: string
  trackCount: number
  track: { id: string; title: string; artist: string } | null
  trackIndex: number
  position: number
  createdAt: string
}

export function HandoffDialog({ variant }: { variant: 'icon' | 'button' }) {
  const [open, setOpen] = useState(false)
  const [handoffs, setHandoffs] = useState<HandoffSummary[] | null>(null)
  const [sending, setSending] = useState(false)
  const [resumingId, setResumingId] = useState<string | null>(null)
  const deviceLabel = getDeviceLabel()

  const loadHandoffs = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/queue')
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { handoffs: HandoffSummary[] }
      setHandoffs(d.handoffs || [])
    } catch {
      setHandoffs([])
    }
  }, [])

  useEffect(() => {
    if (open) loadHandoffs()
  }, [open, loadHandoffs])

  const sendQueue = async () => {
    const s = usePlayer.getState()
    const cur = s.queue[s.index]
    if (!cur) return
    setSending(true)
    try {
      const casting = useCast.getState().connected
      const items = s.queue.map(({ queuedAt: _q, ...rest }) => rest)
      const res = await fetch('/api/sync/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDevice: deviceLabel,
          index: s.index,
          position: Math.round(casting ? useCast.getState().position : s.position),
          shuffle: s.shuffle,
          repeat: s.repeat,
          items,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Queue sent', {
        description: 'Open Dhun on another device → Settings → Continue listening.',
      })
      await loadHandoffs()
    } catch {
      toast.error('Could not send the queue — sync service unreachable')
    } finally {
      setSending(false)
    }
  }

  const resume = async (id: string) => {
    setResumingId(id)
    try {
      const res = await fetch(`/api/sync/queue/${id}`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as {
        fromDevice: string
        trackIndex: number
        position: number
        shuffle: boolean
        repeat: 'off' | 'all' | 'one'
        items: {
          id: string
          source?: string
          title: string
          artist: string
          artwork?: string
          duration?: number
        }[]
      }
      if (!d.items?.length) throw new Error()
      // Coerce to MusicItem: artwork must be a string, source must be a known source tag.
      const items: MusicItem[] = d.items.map((x) => ({
        id: x.id,
        title: x.title,
        artist: x.artist,
        artwork: x.artwork ?? '',
        duration: x.duration ?? 0,
        source: x.source === 'au' || x.source === 'jm' ? x.source : 'yt',
      }))
      usePlayer.getState().resumeHandoff({
        items,
        index: d.trackIndex,
        position: d.position,
        shuffle: d.shuffle,
        repeat: d.repeat,
      })
      toast.success(`Resumed from ${d.fromDevice}`, {
        description: d.items[d.trackIndex]?.title.slice(0, 48),
      })
      setOpen(false)
    } catch {
      toast.error('Could not resume this handoff')
    } finally {
      setResumingId(null)
    }
  }

  const dismiss = async (id: string) => {
    setHandoffs((h) => h?.filter((x) => x.id !== id) ?? null)
    try {
      await fetch(`/api/sync/queue/${id}`, { method: 'DELETE' })
    } catch {}
  }

  const hasQueue = usePlayer((s) => s.queue.length > 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'icon' ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label="Queue handoff — continue on another device"
            title="Continue on another device"
          >
            <MonitorSmartphone className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="rounded-full gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5" /> Continue on another device
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4" /> Queue handoff
          </DialogTitle>
        </DialogHeader>

        {/* Send */}
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground mb-2">
            This device: <span className="font-medium text-foreground">{deviceLabel}</span>
          </p>
          <Button
            className="w-full rounded-full gap-1.5"
            disabled={!hasQueue || sending}
            onClick={sendQueue}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send this queue
          </Button>
          {!hasQueue && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Play something first — the current queue, track and position will be saved.
            </p>
          )}
        </div>

        {/* Resume */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Recent handoffs</p>
          {handoffs === null ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : handoffs.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              Nothing yet. Send a queue from another linked device and it will appear here.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto dhun-scroll">
              {handoffs.map((h) => {
                const mine = h.fromDevice === deviceLabel
                return (
                  <li
                    key={h.id}
                    className="flex items-center gap-2 rounded-xl border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {h.track?.title ?? 'Unknown track'}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <Smartphone className="mr-1 inline h-3 w-3" />
                        {h.fromDevice}
                        {mine && ' (this device)'} • {h.trackCount} tracks •{' '}
                        {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-full gap-1 shrink-0"
                      disabled={resumingId === h.id}
                      onClick={() => resume(h.id)}
                      aria-label={`Resume queue from ${h.fromDevice}`}
                    >
                      {resumingId === h.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      Resume
                    </Button>
                    <button
                      onClick={() => dismiss(h.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                      aria-label="Dismiss handoff"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
