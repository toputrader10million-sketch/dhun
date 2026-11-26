'use client'
import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Heart,
  ListMusic,
  Loader2,
  Mic2,
  Moon,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  AudioWaveform,
  Cast,
  Download,
  X,
} from 'lucide-react'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { TrackImage } from '@/components/track-row'
import { useDataSaver, lowTierArt } from '@/lib/data-saver'
import { LyricsPanel } from './lyrics-panel'
import { useT } from '@/lib/i18n'
import { HandoffDialog } from './handoff-dialog'
import { Visualizer } from './visualizer'
import { usePlayer } from '@/store/player'
import type { MusicItem } from '@/lib/types'
import { useUi } from '@/store/ui'
import { useLibrary } from '@/store/library'
import {
  useSettings,
  RADIO_MOODS,
  RADIO_ERAS,
  type LyricsFontSize,
  LYRICS_FONT_SIZES,
} from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useCast } from '@/lib/cast'
import { useSleepTimer } from '@/lib/sleep-timer'
import { shareTrackCard } from '@/lib/share'
import { toast } from 'sonner'
import { formatDuration } from '@/lib/format'
import { hifiEngine } from '@/engine/hifi'
import { youtubeEngine } from '@/engine/youtube'
import { cn } from '@/lib/utils'

/** Sleep-timer fade guard: true once the volume ramp has started for the current timer. */
let fadeApplied = false

function engineSetVolume(percent: number, hifiActive: boolean) {
  if (hifiActive) hifiEngine.setVolume(percent)
  else youtubeEngine.setVolume(percent)
}

const SLEEP_PRESETS = [15, 30, 45, 60]

/**
 * Sleep timer pro (Day 11): presets + custom minutes, "stop after this track"
 * mode, +5-min extension, and a 5-second volume fade-out before pausing.
 * State lives in src/lib/sleep-timer.ts so the PLAYER can enforce track-end
 * mode even when this dialog is unmounted.
 */
function SleepTimerDialog() {
  const t = useT()
  const togglePlay = usePlayer((s) => s.togglePlay)
  const mode = useSleepTimer((s) => s.mode)
  const endsAt = useSleepTimer((s) => s.endsAt)
  const durationMin = useSleepTimer((s) => s.durationMin)
  const setTimed = useSleepTimer((s) => s.setTimed)
  const setTrackEnd = useSleepTimer((s) => s.setTrackEnd)
  const addMinutes = useSleepTimer((s) => s.addMinutes)
  const cancel = useSleepTimer((s) => s.cancel)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [customMin, setCustomMin] = useState('45')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (mode !== 'timed' || endsAt === null) return
    fadeApplied = false // new timer → reset the fade guard
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      setRemaining(left)
      const st = usePlayer.getState()
      const baseVolume = useSettings.getState().volume
      // Ramp the volume down over the final 5 seconds while playback is active.
      if (left > 0 && left <= 5 && st.isPlaying) {
        fadeApplied = true
        engineSetVolume(Math.round((baseVolume * left) / 5), st.hifiActive)
      }
      if (left <= 0) {
        clearInterval(iv)
        useSleepTimer.getState().cancel()
        setRemaining(null)
        if (fadeApplied) {
          // Restore the user's volume before/after stopping.
          engineSetVolume(baseVolume, st.hifiActive)
          fadeApplied = false
        }
        if (st.isPlaying) togglePlay()
        toast('Sleep timer done', { description: 'Playback paused — sleep well.' })
      }
    }, 1000)
    return () => {
      clearInterval(iv)
      // Timer canceled or dialog unmounted mid-fade → restore volume.
      if (fadeApplied) {
        engineSetVolume(useSettings.getState().volume, usePlayer.getState().hifiActive)
        fadeApplied = false
      }
    }
  }, [mode, endsAt, togglePlay])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const active = mode !== 'off'
  const customNumber = Math.max(1, Math.min(360, Math.round(Number(customMin) || 0)))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-1.5', active && 'text-primary')}
          aria-label={mode === 'timed' ? `Sleep timer active, ${Math.ceil((remaining ?? 0) / 60)} minutes left` : 'Sleep timer'}
        >
          <Timer className={cn('h-4 w-4', active && 'animate-pulse')} />
          {mode === 'timed' && remaining !== null
            ? fmt(remaining)
            : mode === 'track-end'
              ? 'Track end'
              : 'Sleep'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-4 w-4" /> {t('Sleep timer')}
          </DialogTitle>
        </DialogHeader>

        {mode === 'off' ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {SLEEP_PRESETS.map((m) => (
                <Button
                  key={m}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTimed(m)
                    toast('Sleep timer set', { description: `Music stops in ${m} min and fades out softly.` })
                  }}
                >
                  {m}m
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                className="h-9"
                aria-label="Custom minutes"
              />
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => {
                  setTimed(customNumber)
                  toast('Sleep timer set', { description: `Music stops in ${customNumber} min.` })
                }}
              >
                Start
              </Button>
            </div>
            <div className="rounded-xl border border-dashed p-3">
              <p className="text-sm font-medium">After the current track</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Finishes this song, then pauses — no next track.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setTrackEnd()
                  toast('Sleep timer: after this track')
                }}
              >
                Stop after track
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Volume fades out before stop.</p>
          </>
        ) : (
          <div className="space-y-3">
            {mode === 'timed' ? (
              <div className="rounded-xl bg-accent/60 p-4 text-center">
                <p className="text-3xl font-extrabold tabular-nums">
                  {remaining !== null ? fmt(remaining) : `${durationMin ?? 0}:00`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">until playback pauses</p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => addMinutes(5)}>
                    +5 min
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addMinutes(15)}>
                    +15 min
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-accent/60 p-4 text-center">
                <p className="text-lg font-bold">Stop after this track</p>
                <p className="mt-1 text-xs text-muted-foreground">Playback pauses when the song ends.</p>
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                cancel()
                setRemaining(null)
              }}
            >
              Cancel timer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Reorderable queue row (Up Next tab).
 * - Desktop: HTML5 drag & drop via the grip handle.
 * - Touch: dedicated up/down buttons (HTML5 DnD is unreliable on mobile).
 */
function QueueRow({
  item,
  absIndex,
  isFirst,
  isLast,
  onPlay,
  onRemove,
  onMove,
  dragProps,
  isDragging,
  isDragTarget,
}: {
  item: MusicItem
  absIndex: number
  isFirst: boolean
  isLast: boolean
  onPlay: () => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  dragProps: React.HTMLAttributes<HTMLDivElement>
  isDragging: boolean
  isDragTarget: boolean
}) {
  return (
    <div
      draggable
      onDragStart={dragProps.onDragStart}
      onDragOver={dragProps.onDragOver}
      onDragLeave={dragProps.onDragLeave}
      onDrop={dragProps.onDrop}
      onDragEnd={dragProps.onDragEnd}
      className={cn(
        'group flex items-center gap-2 rounded-xl p-2 transition-colors cursor-pointer select-none',
        'hover:bg-accent/60',
        isDragging && 'opacity-40',
        isDragTarget && 'ring-1 ring-primary bg-accent'
      )}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPlay()
        }
      }}
      aria-label={`Play next: ${item.title}. Position ${absIndex + 1} in queue.`}
    >
      <span
        className="flex flex-col shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        aria-hidden
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <TrackImage item={item} className="h-11 w-11" rounded="rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.artist}</p>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {formatDuration(item.duration)}
      </span>
      <span className="flex shrink-0 flex-col" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent"
          aria-label={`Move ${item.title} up in queue`}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent"
          aria-label={`Move ${item.title} down in queue`}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </span>
      <button
        onClick={onRemove}
        className="rounded-full p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent shrink-0"
        aria-label={`Remove ${item.title} from queue`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function NowPlaying() {
  const t = useT()
  const open = useUi((s) => s.nowPlayingOpen)
  const setOpen = (v: boolean) => {
    if (v) openNowPlaying()
    else closeNowPlaying()
  }
  const openNowPlaying = useUi((s) => s.openNowPlaying)
  const closeNowPlaying = useUi((s) => s.closeNowPlaying)
  const current = usePlayer((s) => s.queue[s.index])
  const isPlaying = usePlayer((s) => s.isPlaying)
  const isBuffering = usePlayer((s) => s.isBuffering)
  const loadingTrackId = usePlayer((s) => s.loadingTrackId)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const hifiActive = usePlayer((s) => s.hifiActive)
  const embedMode = usePlayer((s) => s.embedMode)
  const hiResArt = usePlayer((s) => s.hiResArt)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seek = usePlayer((s) => s.seek)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)
  const startRadio = usePlayer((s) => s.startRadio)
  const playQueueAt = usePlayer((s) => s.playQueueAt)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const toggleFavorite = useLibrary((s) => s.toggleFavorite)
  // D58 fix — subscribe to the favorites ARRAY (a stable function selector
  // never triggers re-renders, so the heart went stale while paused).
  const favorites = useLibrary((s) => s.favorites)
  const saver = useDataSaver()
  const region = useSettings((s) => s.region)
  const castAvailable = useCast((s) => s.available)
  const castConnected = useCast((s) => s.connected)
  const castTrackId = useCast((s) => s.trackId)
  const castPosition = useCast((s) => s.position)
  const castDuration = useCast((s) => s.duration)
  const castConnecting = useCast((s) => s.connecting)
  const castDevice = useCast((s) => s.deviceName)
  const castVolume = useCast((s) => s.volume)
  const setVolumeRemote = useCast((s) => s.actions.setVolumeRemote)
  const castCurrent = usePlayer((s) => s.castCurrent)
  const stopCast = useCast((s) => s.actions.stopCast)
  const moveInQueue = usePlayer((s) => s.moveInQueue)
  // Queue reorder drag state (absolute queue indices)
  const dragFromRef = useRef<number | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const downloaded = useOffline((s) => s.isDownloaded(current?.id ?? ''))
  const downloading = useOffline((s) => s.isDownloading(current?.id ?? ''))
  const dlProgress = useOffline((s) => (current ? s.progress[current.id] : undefined))
  const download = useOffline((s) => s.download)

  // Artwork fallback chain: hi-res → stored → YouTube CDN → placeholder
  const [artStage, setArtStage] = useState(0)
  const [prevArtKey, setPrevArtKey] = useState('')
  const artKey = `${current?.id ?? ''}|${hiResArt ?? ''}`
  if (prevArtKey !== artKey) {
    setPrevArtKey(artKey)
    setArtStage(0)
  }

  if (!current) return null

  const casting = castConnected && castTrackId === current.id
  const shownPosition = casting ? castPosition : position
  const shownDuration = casting ? castDuration || duration : duration

  const ytLike = /^[-\w]{11}$/.test(current.id)
  const artCandidates: string[] = []
  if (hiResArt) artCandidates.push(hiResArt)
  if (current.artwork) artCandidates.push(current.artwork)
  if (ytLike) {
    artCandidates.push(`https://i.ytimg.com/vi/${current.id}/hqdefault.jpg`)
    artCandidates.push(`https://i.ytimg.com/vi/${current.id}/mqdefault.jpg`)
  }
  const artSrc = artStage < artCandidates.length ? artCandidates[artStage] : null
  const fav = favorites.some((f) => f.trackId === current.id)
  const upNext = queue.slice(index + 1)

  return (
    <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
      <DrawerContent className="h-[100dvh] mt-0 rounded-t-none border-0 bg-background data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:mt-0">
        {/* Ambient blurred artwork backdrop (DrawerContent is `fixed`, so it
            already provides the positioning context — do NOT add `relative`,
            twMerge would strip `fixed` and break the drawer). */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {artSrc && (
            <img
              src={saver ? lowTierArt(artSrc) || artSrc : artSrc}
              alt=""
              className="h-full w-full scale-125 object-cover blur-3xl opacity-20"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        </div>
        <div className="relative mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col overflow-y-auto dhun-scroll">
          {/* a11y title for the drawer (visually hidden) */}
          <DrawerTitle className="sr-only">Now playing: {current.title}</DrawerTitle>
          {/* top bar */}
          <div className="flex items-center justify-between px-4 pt-4">
            <Button variant="ghost" size="icon" onClick={closeNowPlaying} aria-label={t('Close now playing')}>
              <ChevronDown className="h-5 w-5" />
            </Button>
            <div className="flex flex-col items-center">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Now Playing</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <AudioWaveform className="h-3 w-3" />
                {casting
                  ? 'Casting'
                  : hifiActive
                    ? 'Hi-Fi direct stream'
                    : embedMode
                      ? 'YouTube player'
                      : 'Stable mode'}
                {current.source === 'au' && (
                  <span className="rounded-full bg-primary/15 text-primary px-1.5 font-semibold">Audius</span>
                )}
                {hiResArt && ' • HD art'}
              </span>
            </div>
            <div className="flex items-center">
              <HandoffDialog variant="icon" />
              <SleepTimerDialog />
            </div>
          </div>

          {/* artwork + accent-tinted ambient glow — sleeve re-enters per track */}
          <div className="relative mx-auto mt-6 w-[min(56vw,300px)] shrink-0">
            {/* soft radial halo behind the sleeve — static blur, transform-only animation */}
            <div className="dhun-ambient-glow" aria-hidden />
            <div
              key={current.id}
              className="dhun-art-in relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-primary/20"
            >
              {artSrc ? (
                <img
                  src={artSrc}
                  alt={current.title}
                  onError={() => setArtStage((s) => s + 1)}
                  className={cn(
                    'h-full w-full object-cover transition-transform duration-700',
                    isPlaying ? 'scale-100' : 'scale-95'
                  )}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <AudioWaveform className="h-10 w-10" />
                </div>
              )}
              {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>
          </div>
          <Visualizer className="mx-auto mt-4 block max-w-full opacity-80" />

          {/* title + actions — title block fades in softly on track change */}
          <div className="mt-6 flex items-start gap-3 px-6">
            <div key={current.id} className="dhun-fade-slim min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold leading-snug">{current.title}</h2>
              {current.artist && !/^unknown/i.test(current.artist) ? (
                <button
                  onClick={() => useUi.getState().openArtist(current.artist)}
                  className="mt-0.5 block max-w-full truncate text-left text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                  aria-label={`Open artist page: ${current.artist}`}
                >
                  {current.artist}
                </button>
              ) : (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{current.artist}</p>
              )}
            </div>
            <button
              onClick={() => {
                if (!downloading && !downloaded) download(current, current.source === 'au' ? 'au' : 'yt')
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95 shrink-0"
              aria-label={downloaded ? 'Downloaded for offline' : 'Download for offline'}
              title={downloaded ? 'Available offline' : 'Download for offline'}
            >
              {downloading ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : downloaded ? (
                <Download className="h-5 w-5 text-primary fill-current" />
              ) : (
                <Download className="h-5 w-5" />
              )}
            </button>
            {castAvailable && (
              casting ? (
                // Day 32: casting state — device name + receiver volume in a popover
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-primary transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95 shrink-0"
                      aria-label={`Casting${castDevice ? ` to ${castDevice}` : ''} — open cast controls`}
                    >
                      <Cast className="h-5 w-5" />
                      {castDevice && <span className="max-w-24 truncate text-xs font-medium">{castDevice}</span>}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="center">
                    <p className="mb-2 text-xs font-medium">Casting{castDevice ? ` to ${castDevice}` : ''}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8">Vol</span>
                      <Slider
                        value={[castVolume]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(v) => setVolumeRemote(v[0])}
                        aria-label={t('Receiver volume')}
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{castVolume}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full rounded-full"
                      onClick={stopCast}
                    >
                      Stop casting
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : (
                <button
                  onClick={castCurrent}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95 shrink-0"
                  aria-label={castConnecting ? 'Opening cast device picker' : 'Cast to device'}
                  title={castConnecting ? 'Connecting…' : 'Cast to device'}
                >
                  {castConnecting ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Cast className="h-5 w-5" />}
                </button>
              )
            )}
            <button
              onClick={async () => {
                const res = await shareTrackCard({
                  title: current.title,
                  artist: current.artist,
                  artwork: artSrc ?? current.artwork,
                })
                if (res === 'copied') {
                  toast.success('Link copied', {
                    description: `${current.title} — ${current.artist}`,
                  })
                } else if (res === 'failed') {
                  toast.error('Could not share', {
                    description: 'Sharing is not supported on this device.',
                  })
                } else if (res === 'shared') {
                  toast.success('Shared ♪')
                }
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95 shrink-0"
              aria-label={t('Share this song')}
              title={t('Share this song')}
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              onClick={() => toggleFavorite(current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95 shrink-0"
              aria-label={t('Toggle favorite')}
            >
              <Heart className={cn('h-5 w-5', fav && 'fill-current text-primary')} />
            </button>
          </div>

          {/* seek */}
          <div className="mt-4 px-6">
            <Slider
              value={[Math.min(shownPosition, shownDuration || 1)]}
              max={Math.max(shownDuration, 1)}
              step={1}
              onValueChange={(v) => seek(v[0])}
              aria-label={t('Seek position')}
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>{formatDuration(shownPosition)}</span>
              <span>{formatDuration(shownDuration)}</span>
            </div>
          </div>

          {/* controls */}
          <div className="mt-3 flex items-center justify-center gap-3 px-6" aria-label="Playback controls">
            <button
              onClick={toggleShuffle}
              className={cn(
                'inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90',
                shuffle && 'text-primary'
              )}
              aria-label={t('Toggle shuffle')}
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              onClick={prev}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90"
              aria-label="Previous track"
            >
              <SkipBack className="h-6 w-6 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className={cn(
                'rounded-full bg-primary text-primary-foreground p-4 shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform',
                isPlaying && 'dhun-pulse-glow'
              )}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 fill-current" />
              ) : (
                <Play className="h-7 w-7 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={next}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90"
              aria-label="Next track"
            >
              <SkipForward className="h-6 w-6 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              className={cn(
                'inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90',
                repeat !== 'off' && 'text-primary'
              )}
              aria-label={`Repeat mode: ${repeat}`}
            >
              {repeat === 'one' ? (
                <Repeat1 className="h-5 w-5" />
              ) : (
                <Repeat className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* radio — smart radio (Day 17): mood/era-driven queue or seed-based */}
          <div className="mt-2 flex justify-center px-6">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs">
                  <Radio className="h-3.5 w-3.5" /> {t('Smart radio')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-80 max-w-[92vw] rounded-2xl">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Mood</p>
                <div className="flex flex-wrap gap-1.5">
                  {RADIO_MOODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => startRadio({ mood: m.id, label: `${m.label} radio` })}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-primary hover:text-primary-foreground active:scale-95"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="mb-1.5 mt-3 text-xs font-semibold text-muted-foreground">Era</p>
                <div className="flex flex-wrap gap-1.5">
                  {RADIO_ERAS.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => startRadio({ era: e.id, label: `${e.label} radio` })}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-primary hover:text-primary-foreground active:scale-95"
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 border-t pt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full rounded-full"
                    onClick={() => startRadio({ label: 'Radio' })}
                  >
                    <Radio className="mr-1.5 h-3.5 w-3.5" /> Based on this track
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* tabs: lyrics / queue */}
          <div className="mt-4 flex min-h-[340px] flex-1 flex-col px-4 pb-8">
            <Tabs defaultValue="lyrics" className="h-full flex flex-col">
              <TabsList className="mx-auto grid w-full max-w-xs grid-cols-2">
                <TabsTrigger value="lyrics" className="gap-1.5">
                  <Mic2 className="h-3.5 w-3.5" /> {t('Lyrics')}
                </TabsTrigger>
                <TabsTrigger value="queue" className="gap-1.5">
                  <ListMusic className="h-3.5 w-3.5" /> {t('Up next')}
                  {upNext.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                      {upNext.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="lyrics" className="flex-1 min-h-0 mt-3">
                <LyricsPanel key={`${current.id}-${current.duration}`} item={current} />
              </TabsContent>
              <TabsContent value="queue" className="flex-1 min-h-0 mt-3">
                <div className="h-full overflow-y-auto dhun-scroll">
                  {upNext.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                      <ListMusic className="h-6 w-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Queue is empty. Play a song, then tap “Start radio” to keep the music going.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                        Next from queue
                      </p>
                      {upNext.map((t, i) => {
                        const abs = index + 1 + i
                        return (
                          <QueueRow
                            key={`${t.id}-${t.queuedAt}`}
                            item={t}
                            absIndex={abs}
                            isFirst={i === 0}
                            isLast={i === upNext.length - 1}
                            onPlay={() => playQueueAt(abs)}
                            onRemove={() => removeFromQueue(abs)}
                            onMove={(dir) => moveInQueue(abs, abs + dir)}
                            isDragging={draggingIdx === abs}
                            isDragTarget={dragOverIdx === abs && draggingIdx !== null && draggingIdx !== abs}
                            dragProps={{
                              onDragStart: () => {
                                dragFromRef.current = abs
                                setDraggingIdx(abs)
                              },
                              onDragOver: (e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                setDragOverIdx(abs)
                              },
                              onDragLeave: () =>
                                setDragOverIdx((cur) => (cur === abs ? null : cur)),
                              onDrop: (e) => {
                                e.preventDefault()
                                const from = dragFromRef.current
                                dragFromRef.current = null
                                setDraggingIdx(null)
                                setDragOverIdx(null)
                                if (from !== null && from !== abs) moveInQueue(from, abs)
                              },
                              onDragEnd: () => {
                                dragFromRef.current = null
                                setDraggingIdx(null)
                                setDragOverIdx(null)
                              },
                            }}
                          />
                        )
                      })}
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
