'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { useReducedMotion } from 'framer-motion'
import {
  Activity,
  Check,
  CheckCircle2,
  Download,
  Equal,
  Globe,
  Info,
  Loader2,
  Mic2,
  Monitor,
  Moon,
  Palette,
  Plus,
  RadioTower,
  Sparkles,
  Sun,
  Trash2,
  Waves,
  Zap,
  CloudUpload,
  Copy,
  Crown,
  Link2,
  HardDrive,
  Heart,
  Rocket,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  useSettings,
  EQ_PRESETS,
  EQ_FREQUENCIES_LABELS,
  APP_THEMES,
  ACCENT_GRADIENTS,
  LYRICS_FONT_SIZES,
  applyAccent,
  EQ_SOURCE_KEYS,
  EQ_SOURCE_LABELS,
  eqGainsFor,
  type AccentColor,
  type EqPreset,
  type EqSourceKey,
  type LyricsFontSize,
  type VisualizerMode,
} from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useLibrary } from '@/store/library'
import { useUi } from '@/store/ui'
import { useSmartDownloads, getNetworkSnapshot, subscribeNetwork, getNetworkServerSnapshot } from '@/lib/smart-downloads'
import { triggerInstall } from '@/components/pwa/register-sw'
import { useCast } from '@/lib/cast'
import { HandoffDialog } from '@/components/player/handoff-dialog'
import { StorageCard } from '@/components/settings/storage-card'
import { PerfCard } from '@/components/settings/perf-card'
// Day 52-55 — Pro tier surface (upsell sheet, badges, animated crown, stats)
import { ProSheet, useProSheet } from '@/components/premium/pro-sheet'
import { ProBadge, ProCrown, ProLockChip, useProAction } from '@/components/premium/pro-badge'
import { PRO_FEATURES } from '@/lib/premium'
import { useUsageStats, loyaltyStatus } from '@/lib/usage-stats'
import { useT, LANGUAGES } from '@/lib/i18n'
import type { InstanceStatus } from '@/lib/types'
import { EQ_FREQUENCIES } from '@/engine/hifi'
import { cn } from '@/lib/utils'

interface SyncUser {
  id: string
  code: string
  name: string | null
  createdAt: string
}
interface SyncInfo {
  user: SyncUser
  counts: { favorites: number; playlists: number; history: number }
}

/** Day 25 — vertical 10-band slider row bound to one EQ profile */
function EqSliders({ source, disabled }: { source: EqSourceKey; disabled?: boolean }) {
  const eqProfiles = useSettings((s) => s.eqProfiles)
  const setEqProfileGain = useSettings((s) => s.setEqProfileGain)
  const gains = eqGainsFor(eqProfiles, source === 'default' ? undefined : source)
  return (
    <div className={cn('flex justify-between gap-1.5 sm:gap-2', disabled && 'opacity-40 pointer-events-none')}>
      {gains.map((g, i) => (
        <div key={i} className="flex flex-col items-center gap-2 flex-1">
          <Slider
            orientation="vertical"
            value={[g]}
            min={-12}
            max={12}
            step={0.5}
            onValueChange={(v) => setEqProfileGain(source, i, v[0])}
            className="h-24"
            aria-label={`${EQ_FREQUENCIES[i]}Hz`}
          />
          <span className="text-[10px] text-muted-foreground">{EQ_FREQUENCIES_LABELS[i]}</span>
        </div>
      ))}
    </div>
  )
}

/** Day 25 — full per-source equalizer card */
function EqualizerCard() {
  const t = useT()
  const s = useSettings()
  const [source, setSource] = useState<EqSourceKey>('default')
  const profile = s.eqProfiles[source] ?? { preset: 'flat' as EqPreset, gains: EQ_PRESETS.flat }
  // Day 52 — per-source profiles are EQ Pro; the default (all-audio) profile stays free.
  const proAction = useProAction()
  const pickSource = (k: EqSourceKey) => proAction('eq-pro', () => setSource(k))
  return (
    <section aria-label="Equalizer" className="mb-6 rounded-2xl border p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Equal className="h-4 w-4 text-primary" /> {t('Equalizer')}
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        {t('10-band EQ with a profile per audio source. Audible in Hi-Fi mode and for Audius, Jamendo and offline playback — the YouTube embed player does not expose its audio, so it always plays flat.')}
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {EQ_SOURCE_KEYS.map((k) => {
          const locked = k !== 'default' && !s.premium
          return (
            <button
              key={k}
              onClick={pickSource(k)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                source === k ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
              )}
              aria-pressed={source === k}
            >
              {EQ_SOURCE_LABELS[k]}
              {locked && <Crown className="h-3 w-3 fill-current text-amber-500" aria-hidden />}
            </button>
          )
        })}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {EQ_PRESET_LIST.map((p) => (
          <button
            key={p}
            onClick={() => s.setEqProfilePreset(source, p)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              profile.preset === p
                ? 'border-primary bg-accent/60 text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
            aria-pressed={profile.preset === p}
          >
            {EQ_PRESET_LABELS[p]}
          </button>
        ))}
        {profile.preset === 'custom' && (
          <span className="rounded-full border border-primary/50 bg-accent/60 px-2.5 py-1 text-[11px]">{t('Custom')}</span>
        )}
        <button
          onClick={() => s.resetEqProfile(source)}
          className="ml-auto text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('Reset {0}', [EQ_SOURCE_LABELS[source].toLowerCase()])}
        </button>
      </div>
      <EqSliders source={source} disabled={s.playbackMode !== 'hifi' && source === 'yt'} />
      <p className="mt-3 text-[11px] text-muted-foreground">
        {s.playbackMode !== 'hifi'
          ? t('Switch audio engine to Hi-Fi (Playback above) to hear the EQ on YouTube tracks. Audius, Jamendo and offline playback always honor it.')
          : t('EQ applies live — changes are heard instantly while a Hi-Fi track plays.')}
      </p>
    </section>
  )
}

const REGIONS = [
  { code: 'BD', label: 'Bangladesh' },
  { code: 'IN', label: 'India' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'JP', label: 'Japan' },
]

/** Day 23 — Smart downloads: keep favorites cached automatically (Wi-Fi aware) */
function SmartDownloadsCard() {
  const t = useT()
  const s = useSettings()
  const running = useSmartDownloads((st) => st.running)
  const progress = useSmartDownloads((st) => st.progress)
  const lastResult = useSmartDownloads((st) => st.lastResult)
  const sweepNow = useSmartDownloads((st) => st.sweepNow)
  const offlineCount = useOffline((st) => st.items.length)
  const net = useSyncExternalStore(subscribeNetwork, getNetworkSnapshot, getNetworkServerSnapshot)

  const netLine =
    !net.online
      ? t('offline')
      : net.kind === 'wifi-like'
        ? `${t('unmetered connection')}${net.detail ? ` (${net.detail})` : ''}`
        : net.kind === 'metered'
          ? `${t('metered connection')}${net.detail ? ` (${net.detail})` : ''}`
          : `${t('network type unknown')} ${net.detail ? ` (${net.detail})` : ''}`

  return (
    <div className="space-y-3 rounded-xl border bg-accent/20 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="smart-downloads" className="text-xs">
            {t('Smart downloads')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t('Keeps your favorites cached automatically — checks on app start and whenever you come online. Manual downloads are never touched.')}
          </p>
        </div>
        <Switch
          id="smart-downloads"
          checked={s.smartDownloads}
          onCheckedChange={(v) => {
            s.setSmartDownloads(v)
            if (v) toast(t('Smart downloads on'), { description: t('Favorites will be cached in the background.') })
          }}
        />
      </div>

      {s.smartDownloads && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="smart-wifi-only" className="text-xs">
                {t('Wi-Fi only')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {netLine}. {t('Honest note: browsers hide exact Wi-Fi info — cellular and slow connections are detected when possible, otherwise treated as unknown.')}
              </p>
            </div>
            <Switch id="smart-wifi-only" checked={s.smartWifiOnly} onCheckedChange={s.setSmartWifiOnly} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="smart-limit">{t('Keep up to')}</Label>
            </div>
            <Select value={String(s.smartLimit)} onValueChange={(v) => s.setSmartLimit(Number(v))}>
              <SelectTrigger id="smart-limit" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t('{0} tracks', [n])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full gap-1.5"
              disabled={running}
              onClick={() => void sweepNow()}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {running ? t('Syncing {0}/{1}…', [progress.done + progress.failed, progress.total]) : t('Sync favorites now')}
            </Button>
            {running && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                disabled={s.smartWifiOnly && net?.kind !== 'wifi-like'}
                onClick={() => void sweepNow({ ignoreWifiRule: true })}
              >
                {t('Run on this network anyway')}
              </Button>
            )}
          </div>
          {lastResult && !running && (
            <p className="text-[11px] text-muted-foreground">
              {t('Last check {0}', [new Date(lastResult.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })])}
              {lastResult.downloaded > 0
                ? ` — ${t('saved {0} tracks', [lastResult.downloaded])}`
                : lastResult.skipped === 'up-to-date'
                  ? ` — ${t('favorites already cached')}`
                  : lastResult.skipped === 'limit-reached'
                    ? ` — ${t('download limit reached')}`
                    : lastResult.skipped
                      ? ` — ${lastResult.skipped.replace(/-/g, ' ')}`
                      : ''}
              {offlineCount > 0 && ` • ${t('{0} on device', [offlineCount])}`}
            </p>
          )}
        </>
      )}
    </div>
  )
}

const EQ_PRESET_LIST: Exclude<EqPreset, 'custom'>[] = ['flat', 'bass', 'treble', 'vocal', 'electronic', 'acoustic']
const EQ_PRESET_LABELS: Record<Exclude<EqPreset, 'custom'>, string> = {
  flat: 'Flat',
  bass: 'Bass boost',
  treble: 'Treble',
  vocal: 'Vocal',
  electronic: 'Electronic',
  acoustic: 'Acoustic',
}

const ACCENTS: { id: AccentColor; label: string; swatch: string; gold?: boolean }[] = [
  { id: 'rose', label: 'Rose', swatch: 'bg-[oklch(0.645_0.246_16.44)]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-[oklch(0.769_0.188_70.08)]' },
  { id: 'violet', label: 'Violet', swatch: 'bg-[oklch(0.606_0.25_292.72)]' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-[oklch(0.696_0.17_162.48)]' },
  {
    id: 'gold',
    label: 'Gold',
    swatch:
      'bg-gradient-to-br from-[oklch(0.88_0.13_95)] via-[oklch(0.78_0.15_85)] to-[oklch(0.64_0.13_70)]',
    gold: true,
  },
]

/** Day 55 — Dhun Pro panel: tier status, honest usage stats, feature matrix. */
function ProPanel() {
  const t = useT()
  const s = useSettings()
  const openSheet = useProSheet((st) => st.openSheet)
  const stats = useUsageStats()
  const loyalty = loyaltyStatus(stats ?? undefined)
  const pro = s.premium

  const viaLabel: Record<string, string> = {
    instant: t('Instant unlock'),
    loyalty: t('Loyalty code'),
    feedback: t('Feedback thank-you'),
    code: t('Unlock code'),
  }

  const statTiles: Array<{ label: string; value: string | number; icon: typeof Crown }> = [
    { label: t('Tracks played'), value: stats?.playedLifetime ?? 0, icon: Activity },
    { label: t('Active days'), value: stats?.daysActive ?? 0, icon: Heart },
    {
      label: t('Listening streak'),
      value: stats ? t('{0} day{1}', [String(stats.streak), stats.streak === 1 ? '' : 's']) : '0',
      icon: Heart,
    },
    { label: t('Favorites'), value: stats?.favorites ?? 0, icon: Heart },
    { label: t('Playlists'), value: stats?.playlists ?? 0, icon: Heart },
    { label: t('Offline tracks'), value: stats?.offlineTracks ?? 0, icon: HardDrive },
    { label: t('Artists (recent)'), value: stats?.artistsRecent ?? 0, icon: Mic2 },
    { label: t('Minutes (recent)'), value: stats?.minutesRecent ?? 0, icon: Activity },
  ]

  return (
    <section
      aria-label="Dhun Pro"
      className="dhun-fade-up mb-6 rounded-2xl bg-gradient-to-br from-[oklch(0.88_0.13_95)] via-[oklch(0.78_0.15_85)] to-[oklch(0.6_0.12_60)] p-[1.5px] shadow-lg shadow-amber-500/10"
    >
      <div className="rounded-[calc(var(--radius-lg)-1px)] bg-card p-4 sm:p-5">
        {/* Tier hero */}
        <div className="flex items-start gap-3">
          <span
            className="dhun-shimmer flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.88_0.13_95)] to-[oklch(0.64_0.13_70)] shadow-md shadow-amber-500/25"
            aria-hidden
          >
            <ProCrown active={pro} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="bg-gradient-to-r from-[oklch(0.5_0.11_65)] via-[oklch(0.68_0.14_85)] to-[oklch(0.5_0.11_60)] bg-clip-text text-base font-bold text-transparent">
                {t('Dhun Pro')}
              </h2>
              {pro ? (
                <span className="dhun-shimmer rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                  {t('Active')}
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  {t('Free forever')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {pro
                ? t('Pro unlocked via {0} — since {1}. Every core feature stays free for everyone.', [
                    viaLabel[s.proVia ?? 'instant'],
                    s.proSince ? new Date(s.proSince).toLocaleDateString() : t('today'),
                  ])
                : t('Comfort features for daily listeners — activate free, earn a loyalty code, or send feedback. No payment exists.')}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!pro ? (
            <Button
              onClick={() => openSheet()}
              className="dhun-shimmer gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 font-semibold text-amber-950 shadow-md shadow-amber-500/25 hover:from-amber-300 hover:to-yellow-400"
            >
              <Crown className="h-4 w-4 fill-current" /> {t('Unlock Pro')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              onClick={() => s.deactivatePro()}
            >
              {t('Deactivate Pro')}
            </Button>
          )}
        </div>

        {/* Loyalty progress (free users) */}
        {!pro && (
          <div className="mt-3 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t('Loyalty progress toward a free unlock code')}</span>
              <span>{loyalty.earned ? t('Earned — mint your code in the Pro sheet') : `${Math.round((loyalty.playsPct + loyalty.daysPct) / 2)}%`}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all" style={{ width: `${loyalty.playsPct}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('{0}/{1} plays', [String(loyalty.plays), '25'])}
                </p>
              </div>
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all" style={{ width: `${loyalty.daysPct}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('{0}/{1} days', [String(loyalty.days), '3'])}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Usage stats dashboard */}
        <div className="mt-4" aria-label={t('Usage dashboard')}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('Your usage — counted on this device')}
          </h3>
          <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
            {statTiles.map((tile) => (
              <div key={tile.label} className="rounded-xl border bg-muted/20 p-2.5 text-center">
                <p className="text-lg font-extrabold tabular-nums leading-none">{tile.value}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <tile.icon className="h-2.5 w-2.5" aria-hidden /> {tile.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature matrix */}
        <div className="mt-4" aria-label={t('What Pro adds')}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('What Pro adds')}
          </h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {PRO_FEATURES.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => openSheet(f.id)}
                  className="flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-xs transition-colors hover:bg-accent/40"
                >
                  {pro ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <Crown className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{f.location}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function SettingsView() {
  const t = useT()
  const { theme, setTheme } = useTheme()
  const s = useSettings()
  const openProSheet = useProSheet((st) => st.openSheet)
  // Day 52 — accent designer (custom hex + gradients) is a Pro surface
  const proAction = useProAction()
  // Day 56 — crown watermark respects reduced motion
  const reduceMotion = !!useReducedMotion()
  const [instances, setInstances] = useState<InstanceStatus[] | null>(null)
  const [testing, setTesting] = useState(true)
  // Cloud sync state
  const [sync, setSync] = useState<SyncInfo | null>(null)
  const [syncLoading, setSyncLoading] = useState(true)
  const [deviceName, setDeviceName] = useState('')
  const [linkCode, setLinkCode] = useState('')
  const [linking, setLinking] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  // Day 28: conflict strategy for backup import
  const [importStrategy, setImportStrategy] = useState<'merge' | 'local' | 'cloud'>('merge')
  // Offline storage
  const offlineItems = useOffline((st) => st.items)
  const offlineTotal = useOffline((st) => st.totalSize())
  const offlineClear = useOffline((st) => st.clearAll)
  const castAvailable = useCast((st) => st.available)
  const language = useSettings((st) => st.language)
  const setLanguage = useSettings((st) => st.setLanguage)

  useEffect(() => {
    let alive = true
    fetch('/api/instances')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { instances: InstanceStatus[] }) => {
        if (alive) setInstances(d.instances || [])
      })
      .catch(() => {
        if (alive) toast.error('Could not test instances')
      })
      .finally(() => {
        if (alive) setTesting(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    applyAccent(s.accent, s.customAccent, s.accentGradient)
  }, [s.accent, s.customAccent, s.accentGradient])

  const loadSync = () => {
    setSyncLoading(true)
    fetch('/api/sync/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: SyncInfo) => {
        setSync(d)
        setDeviceName(d.user.name || '')
      })
      .catch(() => setSync(null))
      .finally(() => setSyncLoading(false))
  }

  useEffect(() => {
    loadSync()
  }, [])

  const clearCache = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      toast.success('Offline cache cleared')
    } catch {
      toast.error('Could not clear cache')
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4 max-w-2xl mx-auto pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight mb-6">{t('Settings')}</h1>

      {/* Day 43 — Language switch (English / বাংলা), instant + persisted */}
      <section aria-label="Language" className="dhun-fade-up mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Globe className="h-4 w-4 text-primary" /> {t('Language')}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">{t('Switch the whole app instantly — English or বাংলা.')}</p>
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {LANGUAGES.map((l) => {
            const active = language === l.id
            return (
              <button
                key={l.id}
                onClick={() => setLanguage(l.id)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  active ? 'border-primary bg-accent/40 ring-2 ring-primary/50' : 'hover:bg-accent/40'
                )}
                aria-pressed={active}
              >
                <span className="block text-sm font-bold">{l.native}</span>
                <span className="block text-[10px] text-muted-foreground">{l.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Dhun Pro panel (Day 55) — tier status, usage stats, feature matrix */}
      <ProPanel />

      {/* Themes (pro theme engine) — above the accent controls */}
      <section aria-label="Themes" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Palette className="h-4 w-4 text-primary" /> {t('Themes')}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('Curated dark-tuned looks — applied instantly. Your accent color stays on top. Midnight Rose and Mono Pro are free; the rest are part of the Pro theme engine.')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {APP_THEMES.map((th) => {
            const active = s.appTheme === th.id
            const locked = th.pro && !s.premium
            return (
              <button
                key={th.id}
                onClick={() =>
                  locked ? openProSheet('theme-engine') : s.setAppTheme(th.id)
                }
                className={cn(
                  'relative rounded-xl border p-2 text-left transition-colors',
                  active
                    ? 'border-primary bg-accent/40 ring-2 ring-primary/50'
                    : 'hover:bg-accent/40'
                )}
                aria-label={`Theme ${th.name}${active ? ' (selected)' : ''}${locked ? ' (Pro)' : ''}`}
                aria-pressed={active}
                title={th.pro && !s.premium ? `${th.name} — Dhun Pro` : th.description}
              >
                {th.pro && !s.premium && (
                  <span className="absolute top-2.5 right-2.5 z-10">
                    <ProBadge />
                  </span>
                )}
                {/* Mini mockup painted from the theme's preview colors */}
                <div
                  className="rounded-lg p-2.5"
                  style={{ backgroundColor: th.from }}
                  aria-hidden
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: th.to }} />
                    <span className="h-1.5 w-12 rounded-full bg-white/25" />
                  </div>
                  <span className="mb-1.5 block h-1.5 w-3/4 rounded-full bg-white/15" />
                  <span className="mb-2 block h-1.5 w-1/2 rounded-full bg-white/10" />
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-7 rounded-full" style={{ backgroundColor: th.to }} />
                    <span className="h-2.5 w-7 rounded-full bg-white/15" />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1 px-0.5">
                  <span className="truncate text-xs font-medium">{th.name}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Appearance */}
      <section aria-label="Appearance" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Waves className="h-4 w-4 text-primary" /> {t('Appearance')}
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="theme-select">{t('Theme')}</Label>
              <p className="text-xs text-muted-foreground">{t('Dark is recommended for listening at night.')}</p>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="theme-select" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">
                  <Moon className="mr-1 inline h-3.5 w-3.5" /> {t('Dark')}
                </SelectItem>
                <SelectItem value="light">
                  <Sun className="mr-1 inline h-3.5 w-3.5" /> {t('Light')}
                </SelectItem>
                <SelectItem value="system">
                  <Monitor className="mr-1 inline h-3.5 w-3.5" /> {t('System')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>{t('Accent color')}</Label>
              <p className="text-xs text-muted-foreground">{t('Used across the app UI.')}</p>
            </div>
            <div className="flex gap-2">
              {ACCENTS.map((a) =>
                a.gold ? (
                  <button
                    key={a.id}
                    onClick={() => {
                      // Gold unlocks Dhun Pro (free) and switches to the gold accent —
                      // recorded honestly as an instant unlock (Day 53).
                      if (!s.premium) s.activatePro('instant')
                      s.setAccent('gold')
                      applyAccent('gold')
                    }}
                    className={cn(
                      'relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.88_0.13_95)] via-[oklch(0.78_0.15_85)] to-[oklch(0.64_0.13_70)] ring-2 ring-offset-2 ring-offset-background transition-all',
                      s.accent === 'gold'
                        ? 'ring-foreground'
                        : 'ring-transparent hover:ring-muted-foreground/40'
                    )}
                    aria-label={`Accent ${a.label} (Dhun Premium)`}
                    aria-pressed={s.accent === 'gold'}
                    title={`${a.label} — Dhun Premium theme`}
                  >
                    <Crown
                      className="h-3.5 w-3.5 fill-current text-[oklch(0.42_0.09_65)]"
                      aria-hidden
                    />
                    {!s.premium && (
                      <span
                        className="absolute -top-2 -right-2 z-10"
                        aria-hidden
                      >
                        <span className="dhun-shimmer block rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-px text-[8px] font-bold leading-tight text-amber-950 shadow">
                          Premium
                        </span>
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    key={a.id}
                    onClick={() => {
                      s.setAccent(a.id)
                      applyAccent(a.id)
                    }}
                    className={cn(
                      'h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all',
                      a.swatch,
                      s.accent === a.id
                        ? 'ring-foreground'
                        : 'ring-transparent hover:ring-muted-foreground/40'
                    )}
                    aria-label={`Accent ${a.label}`}
                    aria-pressed={s.accent === a.id}
                  />
                )
              )}
            </div>
          </div>
          {/* Accent designer (Day 9): custom color picker + gradient presets. Day 52: Pro surface. */}
          <div className="space-y-3 rounded-xl border bg-accent/20 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="custom-accent" className="text-xs flex items-center gap-1.5">
                  Custom accent
                  {!s.premium && <ProBadge />}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('Pick any color — shades adapt to light/dark automatically.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.customAccent && (
                  <button
                    onClick={() => s.setCustomAccent(null)}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    aria-label="Reset custom accent"
                  >
                    Reset
                  </button>
                )}
                <label
                  className={cn(
                    'relative block h-7 w-7 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-background transition-all',
                    s.customAccent ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/40'
                  )}
                  style={s.customAccent ? { backgroundColor: s.customAccent } : undefined}
                  title={s.premium ? 'Custom accent' : 'Custom accent — Dhun Pro'}
                  onClick={(e) => {
                    if (!s.premium) {
                      e.preventDefault()
                      openProSheet('accent-designer')
                    }
                  }}
                >
                  {!s.customAccent && (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-rose-500 via-amber-400 to-emerald-400"
                      aria-hidden
                    >
                      <Plus className="h-3.5 w-3.5 text-white/90 drop-shadow" />
                    </span>
                  )}
                  <input
                    id="custom-accent"
                    type="color"
                    value={s.customAccent ?? '#f43f5e'}
                    onChange={(e) => s.setCustomAccent(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Custom accent color"
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <Label className="text-xs">{t('Gradient presets')}</Label>
                <p className="text-xs text-muted-foreground">{t('Two-tone accents blended across the UI.')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ACCENT_GRADIENTS.map((g) => {
                  const on = s.accentGradient?.from === g.from && s.accentGradient?.to === g.to
                  return (
                    <button
                      key={g.id}
                      onClick={proAction('accent-designer', () => s.setAccentGradient({ from: g.from, to: g.to }))}
                      className={cn(
                        'h-7 w-11 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all',
                        on ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/40'
                      )}
                      style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      aria-label={`Gradient accent ${g.label}`}
                      aria-pressed={on}
                      title={g.label}
                    />
                  )
                })}
                {s.accentGradient && (
                  <button
                    onClick={() => s.setAccentGradient(null)}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    aria-label="Reset gradient accent"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Playback */}
      <section aria-label="Playback" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Zap className="h-4 w-4 text-primary" /> {t('Playback')}
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="mode-select">{t('Audio engine')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('Stable: YouTube\'s official player — most reliable, shows a small visible video bubble (required by YouTube). Hi-Fi: direct audio stream with equalizer — best quality when available, falls back automatically.')}
              </p>
            </div>
            <Select value={s.playbackMode} onValueChange={(v: any) => s.setPlaybackMode(v)}>
              <SelectTrigger id="mode-select" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iframe">{t('Stable')}</SelectItem>
                <SelectItem value="hifi">{t('Hi-Fi (beta)')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="gapless-toggle">{t('Gapless playback')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('Pre-buffers the next track so queue transitions are seamless. Active in Hi-Fi mode (direct streams, offline copies and Audius).')}
              </p>
            </div>
            <Switch id="gapless-toggle" checked={s.gaplessPlayback} onCheckedChange={s.setGaplessPlayback} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="crossfade-select">{t('Crossfade')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('Fades the ending track out and the next one in — smooth radio-style transitions in Hi-Fi mode.')}
              </p>
            </div>
            <Select
              value={String(s.crossfade)}
              onValueChange={(v) => s.setCrossfade(Number(v))}
            >
              <SelectTrigger id="crossfade-select" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('Off')}</SelectItem>
                <SelectItem value="2">2s</SelectItem>
                <SelectItem value="4">4s</SelectItem>
                <SelectItem value="6">6s</SelectItem>
                <SelectItem value="8">8s</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="region-select">{t('Music region')}</Label>
              <p className="text-xs text-muted-foreground">{t('Curates your home feed.')}</p>
            </div>
            <Select value={s.region} onValueChange={s.setRegion}>
              <SelectTrigger id="region-select" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    <Globe className="mr-1 inline h-3.5 w-3.5" /> {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="autoplay-radio">Radio autoplay</Label>
              <p className="text-xs text-muted-foreground">Keep playing similar songs when the queue ends.</p>
            </div>
            <Switch id="autoplay-radio" checked={s.autoplayRadio} onCheckedChange={s.setAutoplayRadio} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="auto-mix">Auto-mix (AI queue)</Label>
              <p className="text-xs text-muted-foreground">
                Before the queue runs dry, similar songs are added automatically — the music never stops.
              </p>
            </div>
            <Switch id="auto-mix" checked={s.autoMix} onCheckedChange={s.setAutoMix} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="visualizer-select" className="flex items-center gap-1.5">
                {t('Now Playing visualizer')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('Live audio-reactive art in Hi-Fi, Audius, Jamendo and offline playback. The YouTube embed player does not expose audio data, so it plays without a visualizer. Bars is free; Wave and Ring are Pro.')}
              </p>
            </div>
            <Select
              value={s.visualizer}
              onValueChange={(v: VisualizerMode) => {
                // Day 52 — Wave and Ring are Visualizer Pro; Bars and Off stay free.
                if ((v === 'wave' || v === 'ring') && !s.premium) {
                  openProSheet('visualizer-pro')
                  return
                }
                s.setVisualizer(v)
              }}
            >
              <SelectTrigger id="visualizer-select" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t('Off')}</SelectItem>
                <SelectItem value="bars">{t('Bars')}</SelectItem>
                <SelectItem value="wave">
                  <span className="inline-flex items-center gap-1.5">
                    {t('Wave')} {!s.premium && <Crown className="h-3 w-3 fill-current text-amber-500" aria-hidden />}
                  </span>
                </SelectItem>
                <SelectItem value="ring">
                  <span className="inline-flex items-center gap-1.5">
                    {t('Ring')} {!s.premium && <Crown className="h-3 w-3 fill-current text-amber-500" aria-hidden />}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="desktop-widget">{t('Desktop mini widget')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('A floating compact player with a live spectrum in the corner of the screen (desktop).')}
              </p>
            </div>
            <Switch id="desktop-widget" checked={s.desktopWidget} onCheckedChange={s.setDesktopWidget} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="mini-art">{t('Show art in mini player')}</Label>
            </div>
            <Switch id="mini-art" checked={s.showMiniArt} onCheckedChange={s.setShowMiniArt} />
          </div>
        </div>
      </section>

      {/* Lyrics (Day 12) */}
      <section aria-label="Lyrics" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Mic2 className="h-4 w-4 text-primary" /> {t('Lyrics')}
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          {t('Karaoke mode highlights the line you\'re on with a live sweep. Sizes apply to synced lyrics.')}
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="karaoke-toggle">{t('Karaoke mode')}</Label>
              <p className="text-xs text-muted-foreground">{t('Big centered active line that fills as the song plays.')}</p>
            </div>
            <Switch id="karaoke-toggle" checked={s.lyricsKaraoke} onCheckedChange={s.setLyricsKaraoke} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="lyrics-size">{t('Lyric text size')}</Label>
              <p className="text-xs text-muted-foreground">{t('Normal mode line size (karaoke active line is larger).')}</p>
            </div>
            <Select
              value={s.lyricsFontSize}
              onValueChange={(v: LyricsFontSize) => s.setLyricsFontSize(v)}
            >
              <SelectTrigger id="lyrics-size" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LYRICS_FONT_SIZES) as LyricsFontSize[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {LYRICS_FONT_SIZES[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Equalizer (Day 25) */}
      <EqualizerCard />

      {/* Cloud Sync */}
      <section aria-label="Cloud sync" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <CloudUpload className="h-4 w-4 text-primary" /> {t('Cloud Sync')}
          </h2>
          {sync && (
            <span className="rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-semibold px-2.5 py-1">
              synced • Turso
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {t('Favorites, playlists and history are saved to the cloud (Turso). Enter the same sync code on another device and your whole library shows up there too.')}
        </p>
        {syncLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('Connecting…')}
          </div>
        ) : sync ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border bg-accent/40 px-4 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t('Sync code')}</p>
                <p className="font-mono text-lg font-bold tracking-[0.2em] text-primary">{sync.user.code}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => {
                  navigator.clipboard
                    .writeText(sync.user.code)
                    .then(() => toast.success(t('Sync code copied')))
                    .catch(() => toast.error(t('Copy failed')))
                }}
              >
                <Copy className="h-3.5 w-3.5" /> {t('Copy')}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> {t('Link another device')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{t('Link a device')}</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-muted-foreground">
                    {t('Enter the sync code shown in Settings on your other device — that library will come over to this one.')}
                  </p>
                  <Input
                    value={linkCode}
                    onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 8MHSU48S"
                    className="font-mono tracking-widest"
                    aria-label="Sync code"
                  />
                  <Button
                    disabled={linking || linkCode.trim().length < 6}
                    onClick={async () => {
                      setLinking(true)
                      try {
                        const res = await fetch('/api/sync/link', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ code: linkCode.trim() }),
                        })
                        if (!res.ok) throw new Error()
                        toast.success(t('Device linked — loading library…'))
                        setLinkCode('')
                        loadSync()
                        useLibrary.getState().loadAll()
                      } catch {
                        toast.error(t('Invalid sync code'))
                      } finally {
                        setLinking(false)
                      }
                    }}
                  >
                    {linking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} {t('Link this device')}
                  </Button>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-sm">
              {[
                { label: t('Favorites'), value: sync.counts.favorites, icon: Heart },
                { label: t('Playlists'), value: sync.counts.playlists, icon: Save },
                { label: t('History'), value: sync.counts.history, icon: RadioTower },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border p-3 text-center">
                  <c.icon className="mx-auto h-3.5 w-3.5 text-muted-foreground mb-1" />
                  <p className="text-lg font-bold leading-none">{c.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Device name (e.g. My Phone)"
                className="max-w-56 h-9"
                aria-label="Device name"
              />
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={async () => {
                  await fetch('/api/sync/me', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: deviceName.trim() }),
                  })
                  toast.success(t('Device name saved'))
                  loadSync()
                }}
              >
                {t('Save name')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/sync/data')
                    if (!res.ok) throw new Error()
                    const blob = await res.blob()
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `dhun-backup-${new Date().toISOString().slice(0, 10)}.json`
                    a.click()
                    URL.revokeObjectURL(a.href)
                    toast.success(t('Backup downloaded'))
                  } catch {
                    toast.error(t('Export failed'))
                  }
                }}
              >
                {t('Export backup')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => importFileRef.current?.click()}
              >
                {t('Import backup')}
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const text = await file.text()
                    const res = await fetch('/api/sync/data', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...JSON.parse(text), strategy: importStrategy }),
                    })
                    const d = await res.json()
                    if (!res.ok) throw new Error()
                    const r = d?.resolved
                    toast.success(
                      t('Imported: {0} favorites, {1} playlists', [d?.imported?.favorites ?? 0, d?.imported?.playlists ?? 0]),
                      {
                        description: r
                          ? t('Conflict rules applied: {0} favorites + {1} playlists kept from the cloud, {2} playlists merged.', [r.favoritesKept, r.playlistsKept, r.playlistsAppended])
                          : undefined,
                      }
                    )
                    useLibrary.getState().loadAll()
                    loadSync()
                  } catch {
                    toast.error(t('Import failed — invalid backup file'))
                  } finally {
                    e.target.value = ''
                  }
                }}
              />
            </div>

            {/* Day 28 — conflict rules for backup imports */}
            <div className="rounded-xl bg-accent/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-xs">{t('Conflict rules (import backup)')}</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('Merge: imported data wins, same-name playlists skipped. Local wins: missing tracks are appended to same-name playlists. Cloud wins: existing cloud rows are never touched. Favorites/history always dedupe per song.')}
                  </p>
                </div>
                <Select
                  value={importStrategy}
                  onValueChange={(v) => setImportStrategy(v as 'merge' | 'local' | 'cloud')}
                >
                  <SelectTrigger className="w-36" aria-label="Conflict strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">{t('Merge (safe)')}</SelectItem>
                    <SelectItem value="local">{t('Local wins')}</SelectItem>
                    <SelectItem value="cloud">{t('Cloud wins')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-1 rounded-xl bg-accent/30 p-3">
              <p className="text-xs font-medium mb-1.5">{t('Cross-device queue handoff')}</p>
              <p className="text-[11px] text-muted-foreground mb-2.5">
                {t('Send this device\'s queue to your other devices and continue listening exactly where you left off — same track, same position.')}
              </p>
              <HandoffDialog variant="button" />
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-destructive/10 p-3 text-sm">
            {t('Could not reach the sync service — library stays on this device until it recovers.')}
          </div>
        )}
      </section>

      {/* Offline downloads */}
      <section aria-label="Offline downloads" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <HardDrive className="h-4 w-4 text-primary" /> {t('Offline downloads')}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {offlineItems.length} {t('tracks')} • {offlineTotal > 0 ? `${(offlineTotal / (1024 * 1024)).toFixed(1)} MB` : '0 MB'}
          </span>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="auto-offline">{t('Auto-cache favorites')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('New favorites are downloaded to the device automatically (offline playback).')}
              </p>
            </div>
            <Switch
              id="auto-offline"
              checked={s.autoOfflineFavorites}
              onCheckedChange={s.setAutoOfflineFavorites}
            />
          </div>

          {/* Smart downloads (Day 23) — background sweep of favorites */}
          <SmartDownloadsCard />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full gap-1.5"
              disabled={offlineItems.length === 0}
              onClick={() => {
                offlineClear().then(() => toast.success(t('All downloads removed')))
              }}
            >
              <Trash2 className="h-4 w-4" /> {t('Remove all downloads')}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('Downloads live only on this device (Cache Storage). Offline playback uses the Hi-Fi engine.')}
          </p>
        </div>
      </section>

      {/* Network */}
      <section aria-label="Network" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <RadioTower className="h-4 w-4 text-primary" /> {t('Music network')}
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => useUi.getState().setView('network')}
          >
            <Activity className="h-3.5 w-3.5" /> {t('Health dashboard')}
          </Button>
        </div>
        {instances === null ? (
          <p className="text-xs text-muted-foreground">{t('Testing music network instances…')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {instances.map((inst) => (
              <li key={inst.url} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', inst.ok ? 'bg-emerald-500' : 'bg-destructive')}
                    aria-hidden
                  />
                  <span className="truncate">{inst.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {inst.ok ? `${inst.latencyMs} ms` : t('down')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t("Dhun automatically falls back between free community instances. Playback always uses YouTube's official embedded player.")}{' '}
          {t('Cast')}:{' '}
          {castAvailable ? (
            <span className="text-emerald-500 font-medium">{t('available — look for the cast icon in the player')}</span>
          ) : (
            <span>{t('open Dhun in Chrome/Edge on the same Wi-Fi as your Chromecast')}</span>
          )}
          .
        </p>
      </section>

      {/* App */}
      <section aria-label="App" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Download className="h-4 w-4 text-primary" /> {t('App')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full gap-1.5"
            onClick={async () => {
              const res = await triggerInstall()
              if (res === 'unavailable')
                toast.info(t('Install from browser menu'), {
                  description: t('Chrome/Edge: ⋮ → "Install app". iOS: Share → Add to Home Screen.'),
                })
            }}
          >
            <Download className="h-4 w-4" /> {t('Install Dhun')}
          </Button>
          <Button variant="outline" className="rounded-full gap-1.5" onClick={clearCache}>
            <Trash2 className="h-4 w-4" /> {t('Clear offline cache')}
          </Button>
        </div>
      </section>

      {/* Day 47 — performance budget against live device metrics */}
      <PerfCard />

      {/* Day 48 — storage manager: quota, cache inventory, LRU auto-evict */}
      <StorageCard />

      <Separator className="my-6" />

      {/* Day 56 — About redesigned as a premium landing card */}
      <section
        aria-label="About"
        className="dhun-fade-up relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/10 via-transparent to-transparent p-5 text-center sm:p-6"
      >
        {/* Ambient crown watermark */}
        <div
          className="pointer-events-none absolute -right-6 -top-6 opacity-[0.07]"
          aria-hidden
        >
          <ProCrown active={!reduceMotion} size={150} />
        </div>
        <div className="relative">
          <span
            className={cn(
              'mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl',
              s.premium
                ? 'dhun-shimmer bg-gradient-to-br from-[oklch(0.88_0.13_95)] to-[oklch(0.64_0.13_70)] shadow-md shadow-amber-500/25'
                : 'bg-accent'
            )}
            aria-hidden
          >
            🎵
          </span>
          <p className="text-lg font-extrabold tracking-tight">
            <span
              className={cn(
                s.premium &&
                  'bg-gradient-to-r from-[oklch(0.68_0.14_85)] to-[oklch(0.82_0.15_90)] bg-clip-text text-transparent'
              )}
            >
              Dhun
            </span>
            <span className="text-muted-foreground"> v1.1</span>
            {s.premium && (
              <span className="dhun-shimmer ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 align-middle text-[10px] font-bold text-amber-950">
                <Crown className="h-3 w-3 fill-current" aria-hidden /> Pro
              </span>
            )}
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            {t('A free, open music platform built on public APIs: Piped (metadata), Audius (indie catalog), LRCLIB (synced lyrics), iTunes (artwork) and YouTube\'s official embedded player. Cloud sync on Turso, offline downloads, Chromecast. No ads, no tracking.')}
          </p>
          {/* Feature strip — what the platform ships today */}
          <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-1.5" aria-label={t('Everything included')}>
            {[
              'Search', 'Charts', 'Playlists', 'Lyrics', 'Offline', 'Cloud sync',
              'Sleep timer', 'Karaoke', 'Cast', 'AI DJ', 'EQ', 'Visualizer',
            ].map((f) => (
              <span
                key={f}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {t('Free forever — no ads, no tracking, no payment')}
          </p>
          {/* Day 60 — launch review badge: the 60-day arc shipped in full */}
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
            <Rocket className="h-3.5 w-3.5" aria-hidden />
            {t('60-day arc shipped — 60/60 days, every golden path browser-verified')}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">{t('Made with ♥ for listeners')}</p>
        </div>
      </section>
    </div>
  )
}
