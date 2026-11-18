import { cn } from '@/lib/utils'

interface EqBarsProps {
  /** True when the track is loaded but paused — bars freeze at a low level. */
  paused?: boolean
  className?: string
}

/**
 * 4-bar animated equalizer, pure CSS (no JS per frame).
 * - Bars are accent-tinted via --primary so they follow the theme.
 * - Staggered delays + varied tempos keep the motion organic.
 * - Animation is transform-only (compositor friendly).
 * - Freezes to a static silhouette when `paused`, and under
 *   prefers-reduced-motion (see .dhun-eq in globals.css).
 */
export function EqBars({ paused = false, className }: EqBarsProps) {
  return (
    <span
      className={cn('dhun-eq', className)}
      data-paused={paused ? '' : undefined}
      role="img"
      aria-label={paused ? 'Paused' : 'Now playing'}
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
