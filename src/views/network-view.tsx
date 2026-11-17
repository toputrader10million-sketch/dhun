'use client'
/* Network — Piped instance health dashboard.
 * Live latency probes, uptime history (server memory), sparklines,
 * preferred-instance badge and auto-refresh. All free-instance failover data.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Globe, Info, Loader2, RadioTower, RefreshCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { InstanceHealth, InstanceHealthResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

function latencyColor(ms: number, ok: boolean): string {
  if (!ok) return 'text-destructive'
  if (ms < 800) return 'text-emerald-500'
  if (ms < 2000) return 'text-amber-500'
  return 'text-destructive'
}

function Sparkline({ samples }: { samples: InstanceHealth['history'] }) {
  if (samples.length === 0) return null
  const maxMs = Math.max(...samples.map((s) => s.ms ?? 0), 500)
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden>
      {samples.map((s, i) => (
        <div
          key={s.t + '-' + i}
          className={cn(
            'w-full min-w-[3px] flex-1 rounded-sm',
            s.ok ? 'bg-emerald-500/70' : 'bg-destructive/70'
          )}
          style={{ height: s.ok ? `${Math.max(12, ((s.ms ?? 0) / maxMs) * 100)}%` : '100%' }}
          title={s.ok ? `${s.ms} ms` : 'failed'}
        />
      ))}
    </div>
  )
}

export function NetworkView() {
  const [data, setData] = useState<InstanceHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/instances')
      if (!res.ok) throw new Error()
      setData((await res.json()) as InstanceHealthResponse)
    } catch {
      if (!silent) toast.error('Could not probe instances')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (auto) {
      timerRef.current = setInterval(() => refresh(true), 30_000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [auto, refresh])

  const instances = data?.instances
    ? [...data.instances].sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1
        return a.latencyMs - b.latencyMs
      })
    : []
  const healthy = instances.filter((i) => i.ok)
  const fastest = healthy.length > 0 ? healthy.reduce((a, b) => (a.latencyMs <= b.latencyMs ? a : b)) : null
  const preferred = instances.find((i) => i.preferred) ?? null

  return (
    <div className="px-4 sm:px-6 py-4 max-w-3xl mx-auto pb-16">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Network health</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Live status of the free Piped instances powering search & metadata.
            {data && (
              <>
                {' '}
                Last checked{' '}
                {new Date(data.checkedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
                .
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="auto-refresh" checked={auto} onCheckedChange={setAuto} />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground">
              Auto 30s
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => refresh()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Re-test
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border p-4 text-center">
          <Activity className="mx-auto h-4 w-4 text-muted-foreground mb-1.5" />
          <p className="text-2xl font-bold leading-none">
            {data ? `${healthy.length}/${instances.length}` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">instances healthy</p>
        </div>
        <div className="rounded-2xl border p-4 text-center">
          <Zap className="mx-auto h-4 w-4 text-muted-foreground mb-1.5" />
          <p className="text-2xl font-bold leading-none">
            {fastest ? `${fastest.latencyMs} ms` : '—'}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={fastest?.name}>
            fastest: {fastest?.name ?? 'n/a'}
          </p>
        </div>
        <div className="rounded-2xl border p-4 text-center">
          <RadioTower className="mx-auto h-4 w-4 text-muted-foreground mb-1.5" />
          <p className="truncate text-sm font-bold leading-none pt-1.5" title={preferred?.name}>
            {preferred?.name ?? '—'}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">active instance</p>
        </div>
      </div>

      {/* Instance cards */}
      {data === null && loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Probing instances (up to 6s each)…
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {instances.map((inst) => (
            <div
              key={inst.url}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                !inst.ok && 'bg-destructive/5',
                inst.preferred && inst.ok && 'border-emerald-500/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full',
                      inst.ok ? 'bg-emerald-500' : 'bg-destructive'
                    )}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-semibold">{inst.name}</span>
                  {inst.preferred && (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                      ACTIVE
                    </span>
                  )}
                </span>
                <span className={cn('shrink-0 text-sm font-bold tabular-nums', latencyColor(inst.latencyMs, inst.ok))}>
                  {inst.ok ? `${inst.latencyMs} ms` : 'down'}
                </span>
              </div>

              <div className="mt-3">
                <Sparkline samples={inst.history} />
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Uptime <span className="font-semibold text-foreground">{inst.uptimePct}%</span> ·
                  last {inst.checks}
                </span>
                <span>
                  avg{' '}
                  <span className={cn('font-semibold tabular-nums', latencyColor(inst.avgLatencyMs, inst.avgLatencyMs > 0))}>
                    {inst.avgLatencyMs > 0 ? `${inst.avgLatencyMs} ms` : '—'}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Explainer */}
      <div className="mt-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-primary" /> How failover works
        </h2>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Every search, trending feed and stream lookup tries the active (fastest known) instance
            first, then rotates through the rest with a 6s timeout each.
          </li>
          <li className="flex gap-2">
            <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The first instance that answers is remembered for this server session — the ACTIVE badge
            marks it here.
          </li>
          <li className="flex gap-2">
            <RadioTower className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Playback itself always uses YouTube&apos;s official embedded player, so audio keeps
            working even if every metadata instance goes down.
          </li>
        </ul>
      </div>
    </div>
  )
}
