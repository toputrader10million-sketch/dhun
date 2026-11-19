'use client'
/* Network — Piped instance health dashboard.
 * Live latency probes, uptime history (server memory), sparklines,
 * Day 49: client-side latency graph per instance (this session, persists in
 * localStorage), min/avg/max session stats, preferred-instance badge and
 * auto-refresh. All free-instance failover data.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, BrainCircuit, Globe, Info, Loader2, RadioTower, RefreshCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { InstanceHealth, InstanceHealthResponse } from '@/lib/types'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface AiStatus {
  llm: 'up' | 'down'
  latencyMs: number
  checkedAt: string
}

const HISTORY_KEY = 'dhun-net-latency'
const HISTORY_MAX = 60 // per instance ring buffer (~30 min at 30s probes)

type Sample = { t: number; ms: number | null; ok: boolean }
type ClientHistory = Record<string, Sample[]>

function loadHistory(): ClientHistory {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ClientHistory
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveHistory(h: ClientHistory) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
  } catch {
    /* quota/preflight — history is optional */
  }
}

function recordSamples(instances: InstanceHealth[]) {
  const history = loadHistory()
  const now = Date.now()
  for (const inst of instances) {
    const arr = history[inst.url] ?? []
    arr.push({ t: now, ms: inst.ok ? inst.latencyMs : null, ok: inst.ok })
    history[inst.url] = arr.slice(-HISTORY_MAX)
  }
  saveHistory(history)
}

function latencyColor(ms: number, ok: boolean): string {
  if (!ok) return 'text-destructive'
  if (ms < 800) return 'text-emerald-500'
  if (ms < 2000) return 'text-amber-500'
  return 'text-destructive'
}

/** Server-side uptime history (last N checks, short memory). */
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

/** Day 49 — SVG latency line graph from the client session history. */
function LatencyGraph({ samples }: { samples: Sample[] }) {
  if (samples.length < 2) return null
  const W = 240
  const H = 44
  const pad = 3
  const recent = samples.slice(-30)
  const values = recent.map((s) => s.ms ?? 0)
  const maxMs = Math.max(...values, 400)
  const minMs = Math.min(...values.map((v) => (v > 0 ? v : maxMs)))
  const step = (W - pad * 2) / (recent.length - 1)
  const points = recent
    .map((s, i) => {
      const x = pad + i * step
      const y = H - pad - ((s.ms ?? 0) / maxMs) * (H - pad * 2)
      return `${x.toFixed(1)},${Math.max(pad, Math.min(H - pad, y)).toFixed(1)}`
    })
    .join(' ')
  const failed = recent.filter((s) => !s.ok).length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" aria-hidden preserveAspectRatio="none">
      {/* Y grid at 25/50/75% */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} className="stroke-muted-foreground/15" strokeWidth="1" />
      ))}
      <polyline points={points} fill="none" className={failed === recent.length ? 'stroke-destructive' : 'stroke-emerald-500'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {recent.map((s, i) =>
        !s.ok ? (
          <circle key={i} cx={pad + i * step} cy={H - pad} r="2.5" className="fill-destructive" />
        ) : null
      )}
      <title>{`min ${minMs} · max ${maxMs} ms`}</title>
    </svg>
  )
}

function sessionStats(samples: Sample[]): { min: number; avg: number; max: number; fails: number } | null {
  const oks = samples.filter((s) => s.ok && s.ms !== null).map((s) => s.ms as number)
  if (oks.length === 0) return null
  return {
    min: Math.min(...oks),
    avg: Math.round(oks.reduce((a, b) => a + b, 0) / oks.length),
    max: Math.max(...oks),
    fails: samples.filter((s) => !s.ok).length,
  }
}

export function NetworkView() {
  const t = useT()
  const [data, setData] = useState<InstanceHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState(true)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [hist, setHist] = useState<ClientHistory>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshAi = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/status')
      if (res.ok) setAi((await res.json()) as AiStatus)
    } catch {
      setAi(null)
    }
  }, [])

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/instances')
      if (!res.ok) throw new Error()
      const d = (await res.json()) as InstanceHealthResponse
      setData(d)
      // Day 49 — record this session's probe into the persistent client history
      if (d?.instances?.length) {
        recordSamples(d.instances)
        setHist(loadHistory())
      }
    } catch {
      if (!silent) toast.error(t('Could not probe instances'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    setHist(loadHistory())
    refresh()
    refreshAi()
  }, [refresh, refreshAi])

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
          <h1 className="text-2xl font-extrabold tracking-tight">{t('Network health')}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Live status of the free Piped instances powering search & metadata.')}
            {data && <> {t('Last checked {0}', [new Date(data.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })])}</>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="auto-refresh" checked={auto} onCheckedChange={setAuto} />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground">
              {t('Auto 30s')}
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
            {t('Re-test')}
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
          <p className="mt-1 text-[11px] text-muted-foreground">{t('instances healthy')}</p>
        </div>
        <div className="rounded-2xl border p-4 text-center">
          <Zap className="mx-auto h-4 w-4 text-muted-foreground mb-1.5" />
          <p className="text-2xl font-bold leading-none">
            {fastest ? `${fastest.latencyMs} ms` : '—'}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={fastest?.name}>
            {t('fastest: {0}', [fastest?.name ?? 'n/a'])}
          </p>
        </div>
        <div className="rounded-2xl border p-4 text-center">
          <RadioTower className="mx-auto h-4 w-4 text-muted-foreground mb-1.5" />
          <p className="truncate text-sm font-bold leading-none pt-1.5" title={preferred?.name}>
            {preferred?.name ?? '—'}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t('active instance')}</p>
        </div>
      </div>

      {/* AI services (Day 24) */}
      <div className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-primary" /> {t('AI services')}
          </h2>
          {ai ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-semibold',
                ai.llm === 'up' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-destructive/15 text-destructive'
              )}
            >
              {ai.llm === 'up' ? t('LLM up · {0} ms', [ai.latencyMs]) : t('LLM down')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t('probing…')}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('Copilot, natural-language search, AI playlists and the Daily Mix planner all run on one shared language model with in-memory caches (identical requests answer instantly). When the model is down, every AI feature falls back to an offline rule-based planner — you may notice simpler, more literal results, but nothing breaks.')}
        </p>
      </div>

      {/* Instance cards */}
      {data === null && loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Probing instances (up to 6s each)…')}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {instances.map((inst) => {
            const samples = hist[inst.url] ?? []
            const stats = sessionStats(samples)
            return (
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
                        {t('ACTIVE')}
                      </span>
                    )}
                  </span>
                  <span className={cn('shrink-0 text-sm font-bold tabular-nums', latencyColor(inst.latencyMs, inst.ok))}>
                    {inst.ok ? `${inst.latencyMs} ms` : t('down')}
                  </span>
                </div>

                {/* Day 49 — this session's latency graph (persistent, client-side) */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{t('Latency — this session')}</span>
                    {stats && (
                      <span className="tabular-nums">
                        {t('min {0}', [stats.min])} · {t('avg {0}', [stats.avg])} · {t('max {0}', [stats.max])} ms
                        {stats.fails > 0 ? ` · ${t('{0} failed', [stats.fails])}` : ''}
                      </span>
                    )}
                  </div>
                  <LatencyGraph samples={samples} />
                  {samples.length < 2 && (
                    <p className="text-[10px] text-muted-foreground">
                      {t('Graph builds as probes run (a point every 30s, saved for this device).')}
                    </p>
                  )}
                </div>

                <div className="mt-3">
                  <Sparkline samples={inst.history} />
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {t('Uptime {0}%', [inst.uptimePct])} · {t('last {0}', [inst.checks])}
                  </span>
                  <span>
                    {t('avg')}{' '}
                    <span className={cn('font-semibold tabular-nums', latencyColor(inst.avgLatencyMs, inst.avgLatencyMs > 0))}>
                      {inst.avgLatencyMs > 0 ? `${inst.avgLatencyMs} ms` : '—'}
                    </span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Explainer */}
      <div className="mt-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-primary" /> {t('How failover works')}
        </h2>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('Every search, trending feed and stream lookup tries the active (fastest known) instance first, then rotates through the rest with a 6s timeout each.')}
          </li>
          <li className="flex gap-2">
            <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('The first instance that answers is remembered for this server session — the ACTIVE badge marks it here.')}
          </li>
          <li className="flex gap-2">
            <RadioTower className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("Playback itself always uses YouTube's official embedded player, so audio keeps working even if every metadata instance goes down.")}
          </li>
        </ul>
      </div>
    </div>
  )
}
