'use client'
/* Dhun — Day 47: performance budget card (Settings).
 * Live, honest measurement of this device's load experience against the
 * Dhun performance budget (PERF-BUDGET.md). Not a Lighthouse score — the
 * budget gate in CI is documented; this card proves the budget holds on the
 * user's actual device and network.
 */
import { useEffect, useMemo, useState } from 'react'
import { Gauge } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Dhun perf budget (see PERF-BUDGET.md at repo root) */
const BUDGET = {
  ttfbMs: 800,
  fcpMs: 2000,
  lcpMs: 2500,
  jsBytes: 500 * 1024, // transferSize across first-load script resources
}

interface Metrics {
  ttfb: number | null
  fcp: number | null
  lcp: number | null
  jsBytes: number | null
  domReady: number | null
}

function verdict(value: number | null, budget: number): 'pass' | 'near' | 'over' | 'n/a' {
  if (value === null) return 'n/a'
  if (value <= budget) return 'pass'
  if (value <= budget * 1.5) return 'near'
  return 'over'
}

function readMetrics(): Metrics {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const ttfb = nav ? Math.round(nav.responseStart) : null
  const domReady = nav ? Math.round(nav.domContentLoadedEventEnd) : null
  const paints = performance.getEntriesByType('paint')
  const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null
  const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
  const lcp = lcpEntries.length > 0 ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null
  let jsBytes = 0
  for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (r.initiatorType === 'script' || (r.name.endsWith('.js') && r.transferSize > 0)) jsBytes += r.transferSize
  }
  return {
    ttfb,
    fcp: fcp !== null ? Math.round(fcp) : null,
    lcp,
    jsBytes: jsBytes > 0 ? jsBytes : null,
    domReady,
  }
}

export function PerfCard() {
  const t = useT()
  const [m, setM] = useState<Metrics | null>(null)

  useEffect(() => {
    // LCP often lands after first paint — re-read shortly after mount.
    const read = () => setM(readMetrics())
    read()
    const timer = setTimeout(read, 2500)
    return () => clearTimeout(timer)
  }, [])

  const rows = useMemo(() => {
    if (!m) return []
    return [
      { label: t('Time to first byte'), value: m.ttfb !== null ? `${m.ttfb} ms` : '—', v: verdict(m.ttfb, BUDGET.ttfbMs), budget: `≤ ${BUDGET.ttfbMs} ms` },
      { label: 'FCP', value: m.fcp !== null ? `${m.fcp} ms` : '—', v: verdict(m.fcp, BUDGET.fcpMs), budget: `≤ ${BUDGET.fcpMs} ms` },
      { label: 'LCP', value: m.lcp !== null ? `${m.lcp} ms` : '—', v: verdict(m.lcp, BUDGET.lcpMs), budget: `≤ ${BUDGET.lcpMs} ms` },
      { label: t('JavaScript transferred'), value: m.jsBytes !== null ? formatBytes(m.jsBytes) : '—', v: verdict(m.jsBytes, BUDGET.jsBytes), budget: `≤ ${formatBytes(BUDGET.jsBytes)}` },
    ]
  }, [m, t])

  const chip = (v: string) =>
    v === 'pass'
      ? 'bg-emerald-500/15 text-emerald-500'
      : v === 'near'
        ? 'bg-amber-500/15 text-amber-500'
        : v === 'over'
          ? 'bg-destructive/15 text-destructive'
          : 'bg-accent text-muted-foreground'
  const chipLabel = (v: string) => (v === 'pass' ? t('Pass') : v === 'near' ? t('Near limit') : v === 'over' ? t('Over budget') : '—')

  return (
    <section aria-label="Performance" className="mb-6 rounded-2xl border p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Gauge className="h-4 w-4 text-primary" /> {t('Performance budget')}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('Live measurements on this device against the Dhun budget (PERF-BUDGET.md) — the same gates the CI Lighthouse run enforces.')}
      </p>
      <div className="overflow-hidden rounded-xl border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 border-b px-3 py-2.5 text-xs last:border-b-0">
            <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.value} <span className="text-[10px]">({r.budget})</span></span>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', chip(r.v))}>
              {chipLabel(r.v)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {t('Measured after this page load. Dev-mode and slow networks can exceed budgets — production builds are what CI gates.')}
      </p>
    </section>
  )
}
