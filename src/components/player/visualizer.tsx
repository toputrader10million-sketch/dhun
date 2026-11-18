'use client'
/* Dhun — Now Playing visualizer (Day 26).
 *
 * Three audio-reactive modes driven by the Hi-Fi engine's AnalyserNode:
 *   bars — spectrum columns with falling peak caps
 *   wave — smooth time-domain waveform with a soft glow
 *   ring — radial spectrum around a circular core
 *
 * HONEST RULE: the YouTube iframe player does not expose its audio to the
 * page, so when the Hi-Fi engine isn't driving playback this component
 * renders NOTHING instead of faking data.
 */
import { useEffect, useRef } from 'react'
import { usePlayer } from '@/store/player'
import { useSettings, type VisualizerMode } from '@/store/settings'
import { hifiEngine } from '@/engine/hifi'

function readPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Visualizer({ mode: modeProp, className }: { mode?: VisualizerMode; className?: string }) {
  const settingMode = useSettings((s) => s.visualizer)
  const mode = modeProp ?? settingMode
  const hifiActive = usePlayer((s) => s.hifiActive)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<number[]>([])

  useEffect(() => {
    if (mode === 'off' || !hifiActive) return
    const reduced = readPrefersReducedMotion()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bars = mode === 'ring' ? 48 : 40
    if (peaksRef.current.length !== bars) peaksRef.current = new Array(bars).fill(0)

    let raf = 0
    const accent = 'oklch(0.66 0.22 15)'

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const levels = hifiEngine.getLevels()
      const wave = mode === 'wave' ? hifiEngine.getWave() : null
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      if (!levels) return

      if (mode === 'bars') {
        const step = Math.max(1, Math.floor(levels.length / bars))
        const bw = w / bars
        for (let i = 0; i < bars; i++) {
          const v = levels[Math.min(i * step, levels.length - 1)] / 255
          const bh = Math.max(2, v * h)
          peaksRef.current[i] = Math.max(bh, (peaksRef.current[i] ?? 0) - h * 0.02)
          ctx.fillStyle = `oklch(0.62 0.2 20 / ${0.25 + v * 0.65})`
          ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh)
          // peak cap
          ctx.fillStyle = accent
          const cap = peaksRef.current[i]
          if (cap > 3) ctx.fillRect(i * bw + 1, h - cap, bw - 2, 2)
        }
        return
      }

      if (mode === 'wave' && wave) {
        ctx.lineWidth = 2
        ctx.strokeStyle = accent
        ctx.shadowColor = accent
        ctx.shadowBlur = 8
        ctx.beginPath()
        const n = wave.length
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w
          const y = h / 2 + ((wave[i] - 128) / 128) * (h / 2 - 2)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
        return
      }

      if (mode === 'ring') {
        // Radial spectrum around a circular core
        const cx = w / 2
        const cy = h / 2
        const inner = Math.min(w, h) * 0.22
        const outer = Math.min(w, h) / 2 - 2
        const step = Math.max(1, Math.floor(levels.length / bars))
        for (let i = 0; i < bars; i++) {
          const v = levels[Math.min(i * step, levels.length - 1)] / 255
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
          const r = inner + (outer - inner) * Math.max(0.04, v)
          ctx.strokeStyle = `oklch(0.62 0.2 20 / ${0.3 + v * 0.6})`
          ctx.lineWidth = Math.max(2, (outer - inner) / bars)
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
          ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
          ctx.stroke()
        }
        // core disc
        ctx.fillStyle = 'oklch(0.62 0.2 20 / 0.14)'
        ctx.beginPath()
        ctx.arc(cx, cy, inner * 0.82, 0, Math.PI * 2)
        ctx.fill()
        return
      }

      // wave without data (rare) — calm idle line
      ctx.strokeStyle = 'oklch(0.62 0.2 20 / 0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [mode, hifiActive, isPlaying])

  if (mode === 'off' || !hifiActive) return null

  const size =
    mode === 'ring'
      ? { width: 180, height: 180 }
      : { width: 480, height: mode === 'wave' ? 72 : 48 }

  return (
    <canvas
      ref={canvasRef}
      width={size.width}
      height={size.height}
      className={className}
      aria-hidden
    />
  )
}
