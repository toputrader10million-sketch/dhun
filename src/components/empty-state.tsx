'use client'

/**
 * Day 41 — Unified empty-state system.
 * One component for every "nothing here yet" moment: consistent layout,
 * icon, honest hint, optional action. Replaces the per-view inline copies.
 */

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  iconTone = 'muted',
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: { label: string; onClick: () => void }
  className?: string
  /** 'muted' = neutral icon, 'primary' = accent-colored icon */
  iconTone?: 'muted' | 'primary'
}) {
  return (
    <div className={cn('rounded-xl bg-accent/40 p-8 text-center', className)}>
      <Icon
        className={cn('mx-auto mb-2 h-6 w-6', iconTone === 'primary' ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
