'use client'
// Visible YouTube video bubble.
//
// YouTube's embedded player applies a "Sign in to confirm you're not a bot"
// gate to embeds it considers hidden (opacity ~0, tiny size, offscreen).
// That silently stalls playback forever. While the embed engine drives
// playback this bubble stays genuinely visible (real pixels, real size) —
// audio plays as usual and the user even gets the video for free.
// The host div must ALWAYS stay mounted: unmounting the iframe kills the
// YouTube player instance and any ongoing playback.
import { useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { usePlayer } from '@/store/player'
import { cn } from '@/lib/utils'

export function VideoBubble() {
  const embedMode = usePlayer((s) => s.embedMode)
  const currentSource = usePlayer((s) => s.queue[s.index]?.source)
  const [compact, setCompact] = useState(false)

  const visible = embedMode && currentSource !== 'au'
  const size = compact ? { width: 136, height: 76 } : { width: 224, height: 126 }

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed right-3 z-30 flex flex-col items-end gap-1.5 transition-all duration-300',
        'bottom-[9.75rem] md:bottom-[4.25rem]',
        visible ? 'opacity-100 translate-y-0' : 'pointer-events-none translate-y-2 opacity-0'
      )}
    >
      <button
        onClick={() => setCompact((c) => !c)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur hover:text-foreground transition-opacity',
          !visible && 'opacity-0'
        )}
        aria-label={compact ? 'Expand video player' : 'Shrink video player'}
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
      >
        {compact ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
        {compact ? 'Expand' : 'Shrink'}
      </button>
      <div
        style={{ width: size.width, height: size.height }}
        className="overflow-hidden rounded-xl border bg-black shadow-xl shadow-black/40"
      >
        {/* YouTube IFrame API replaces this div with the player iframe */}
        <div id="dhun-yt-host" className="h-full w-full" />
      </div>
    </div>
  )
}
