'use client'
import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
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
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  AudioWaveform,
  Cast,
  Download,
} from 'lucide-react'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { TrackRow } from '@/components/track-row'
import { LyricsPanel } from './lyrics-panel'
import { HandoffDialog } from './handoff-dialog'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useCast } from '@/lib/cast'
import { formatDuration } from '@/lib/format'
import { hifiEngine } from '@/engine/hifi'
import { cn } from '@/lib/utils'

function Visualizer() {
  const hifiActive = usePlayer((s) => s.hifiActive)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!hifiActive) return
    let raf: number
    const canvas = canvasRef.current
    const ctx2d = canvas?.getContext('2d')
    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (!canvas || !ctx2d) return
      const levels = hifiEngine.getLevels()
      ctx2d.clearRect(0, 0, canvas.width, canvas.height)
      if (!levels) return
      const bars = 32
      const step = Math.floor(levels.length / bars)
      const w = canvas.width / bars
      for (let i = 0; i < bars; i++) {
        const v = levels[i * step] / 255
        const h = Math.max(2, v * canvas.height)
        ctx2d.fillStyle = `oklch(0.65 0.22 20 / ${0.25 + v * 0.6})`
        ctx2d.fillRect(i * w + 1, canvas.height - h, w - 2, h)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [hifiActive])
  if (!hifiActive) return null
  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={48}
      className="mt-3 w-full opacity-80"
      aria-hidden
    />
  )
}

function SleepTimerDialog() {
  const togglePlay = usePlayer((s) => s.togglePlay)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (minutes === null) return
    const endAt = Date.now() + minutes * 60_000
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        clearInterval(iv)
        setMinutes(null)
        setRemaining(null)
        if (usePlayer.getState().isPlaying) togglePlay()
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [minutes, togglePlay])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const shownRemaining = remaining ?? (minutes !== null ? minutes * 60 : null)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Timer className="h-4 w-4" />
          {shownRemaining !== null ? fmt(shownRemaining) : 'Sleep'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-4 w-4" /> Sleep timer
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Music will pause automatically when time is up.</p>
        <div className="grid grid-cols-4 gap-2">
          {[15, 30, 45, 60].map((m) => (
            <Button
              key={m}
              variant={minutes === m ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMinutes(m)}
            >
              {m}m
            </Button>
          ))}
        </div>
        {minutes !== null && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setMinutes(null)
              setRemaining(null)
            }}
          >
            Cancel timer
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function NowPlaying() {
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
  const isFavorite = useLibrary((s) => s.isFavorite)
  const region = useSettings((s) => s.region)
  const castAvailable = useCast((s) => s.available)
  const castConnected = useCast((s) => s.connected)
  const castTrackId = useCast((s) => s.trackId)
  const castPosition = useCast((s) => s.position)
  const castDuration = useCast((s) => s.duration)
  const castCurrent = usePlayer((s) => s.castCurrent)
  const stopCast = useCast((s) => s.actions.stopCast)
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
  const fav = isFavorite(current.id)
  const upNext = queue.slice(index + 1)

  return (
    <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
      <DrawerContent className="h-[100dvh] mt-0 rounded-t-none border-0 bg-background data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:mt-0">
        <div className="mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col overflow-y-auto dhun-scroll">
          {/* a11y title for the drawer (visually hidden) */}
          <DrawerTitle className="sr-only">Now playing: {current.title}</DrawerTitle>
          {/* top bar */}
          <div className="flex items-center justify-between px-4 pt-4">
            <Button variant="ghost" size="icon" onClick={closeNowPlaying} aria-label="Close now playing">
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

          {/* artwork */}
          <div className="relative mx-auto mt-4 w-[min(56vw,300px)] aspect-square shrink-0 overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-primary/20">
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
          <Visualizer />

          {/* title + actions */}
          <div className="mt-6 flex items-start gap-3 px-6">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold leading-snug">{current.title}</h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{current.artist}</p>
            </div>
            <button
              onClick={() => {
                if (!downloading && !downloaded) download(current, current.source === 'au' ? 'au' : 'yt')
              }}
              className="rounded-full p-2 hover:bg-accent shrink-0"
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
              <button
                onClick={() => {
                  if (casting) stopCast()
                  else castCurrent()
                }}
                className={cn('rounded-full p-2 hover:bg-accent shrink-0', casting && 'text-primary')}
                aria-label={casting ? 'Disconnect cast' : 'Cast to device'}
                title={casting ? 'Disconnect cast' : 'Cast to device'}
              >
                <Cast className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={() => toggleFavorite(current)}
              className="rounded-full p-2 hover:bg-accent shrink-0"
              aria-label="Toggle favorite"
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
              aria-label="Seek position"
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
              className={cn('rounded-full p-2.5 hover:bg-accent', shuffle && 'text-primary')}
              aria-label="Toggle shuffle"
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              onClick={prev}
              className="rounded-full p-2.5 hover:bg-accent"
              aria-label="Previous track"
            >
              <SkipBack className="h-6 w-6 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="rounded-full bg-primary text-primary-foreground p-4 shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 fill-current" />
              ) : (
                <Play className="h-7 w-7 fill-current ml-0.5" />
              )}
            </button>
            <button onClick={next} className="rounded-full p-2.5 hover:bg-accent" aria-label="Next track">
              <SkipForward className="h-6 w-6 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              className={cn('rounded-full p-2.5 hover:bg-accent', repeat !== 'off' && 'text-primary')}
              aria-label={`Repeat mode: ${repeat}`}
            >
              {repeat === 'one' ? (
                <Repeat1 className="h-5 w-5" />
              ) : (
                <Repeat className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* radio */}
          <div className="mt-2 flex justify-center px-6">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5 text-xs"
              onClick={startRadio}
            >
              <Radio className="h-3.5 w-3.5" /> Start radio
            </Button>
          </div>

          {/* tabs: lyrics / queue */}
          <div className="mt-4 flex min-h-[340px] flex-1 flex-col px-4 pb-8">
            <Tabs defaultValue="lyrics" className="h-full flex flex-col">
              <TabsList className="mx-auto grid w-full max-w-xs grid-cols-2">
                <TabsTrigger value="lyrics" className="gap-1.5">
                  <Mic2 className="h-3.5 w-3.5" /> Lyrics
                </TabsTrigger>
                <TabsTrigger value="queue" className="gap-1.5">
                  <ListMusic className="h-3.5 w-3.5" /> Up next
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
                      {upNext.map((t, i) => (
                        <TrackRow
                          key={`${t.id}-${t.queuedAt}`}
                          item={t}
                          index={i}
                          context={queue.map((q) => q)}
                          onRemove={() => removeFromQueue(index + 1 + i)}
                        />
                      ))}
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
