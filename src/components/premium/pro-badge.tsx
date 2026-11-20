'use client'
/* Dhun — Pro badges, gate helper and the animated crown signature.
 *
 * Day 52: `useProAction` is the single gate helper — wrap any callback and
 * it either runs (Pro active / feature not gated) or opens the honest
 * upsell sheet. `ProBadge` marks Pro surfaces.
 * Day 54: `ProCrown` is the premium visual signature — a gold crown that
 * gently floats with a periodic shimmer pulse (respects reduced motion).
 */
import { motion, useReducedMotion } from 'framer-motion'
import { Crown } from 'lucide-react'
import { useCallback } from 'react'
import { useProSheet } from '@/components/premium/pro-sheet'
import { isGated, type ProFeatureId } from '@/lib/premium'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'

/**
 * Gate helper (Day 52): `const guarded = useProAction(); onClick={guarded('ai-dj', () => play())}`
 * — runs the callback when Pro is active (or the flag is off), otherwise
 * opens the upsell sheet with the feature highlighted.
 */
export function useProAction() {
  const premium = useSettings((s) => s.premium)
  const openSheet = useProSheet((s) => s.openSheet)
  return useCallback(
    <T extends unknown[]>(feature: ProFeatureId, fn: (...args: T) => void) =>
      (...args: T) => {
        if (premium || !isGated(feature)) fn(...args)
        else openSheet(feature)
      },
    [premium, openSheet]
  )
}

/** Compact gold chip — "PRO" with a crown, used on Pro surfaces. */
export function ProBadge({ className, label = 'Pro' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'dhun-shimmer inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-px text-[9px] font-bold leading-tight text-amber-950 shadow-sm',
        className
      )}
    >
      <Crown className="h-2.5 w-2.5 fill-current" aria-hidden /> {label}
    </span>
  )
}

/**
 * Animated premium crown (Day 54): float + shimmer, gold gradient fill.
 * `active` renders the signature state (gentle float); reduced-motion
 * users get a static crown. `muted` renders the plain outline crown used
 * as a lock affordance on gated controls.
 */
export function ProCrown({
  className,
  size = 18,
  active = false,
  muted = false,
}: {
  className?: string
  size?: number
  active?: boolean
  muted?: boolean
}) {
  const reduceMotion = !!useReducedMotion()
  const animate = active && !reduceMotion ? { y: [0, -2.5, 0] } : { y: 0 }
  return (
    <motion.span
      className={cn('inline-flex', className)}
      animate={animate}
      transition={active && !reduceMotion ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
    >
      <Crown
        width={size}
        height={size}
        aria-hidden
        className={cn(
          muted
            ? 'text-amber-600 dark:text-amber-400'
            : 'fill-current text-[oklch(0.42_0.09_65)] drop-shadow-[0_1px_6px_rgba(245,158,11,0.45)]'
        )}
      />
    </motion.span>
  )
}

/** Small lock chip shown on gated rows/controls (opens the sheet on tap). */
export function ProLockChip({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dhun-shimmer inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm transition-transform hover:scale-105"
      aria-label={label}
    >
      <Crown className="h-3 w-3 fill-current" aria-hidden /> Pro
    </button>
  )
}
