'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Download,
  Equal,
  Globe,
  Info,
  Loader2,
  Monitor,
  Moon,
  RadioTower,
  Sun,
  Trash2,
  Waves,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useSettings, EQ_PRESETS, applyAccent, type AccentColor, type EqPreset } from '@/store/settings'
import { triggerInstall } from '@/components/pwa/register-sw'
import type { InstanceStatus } from '@/lib/types'
import { EQ_FREQUENCIES } from '@/engine/hifi'
import { cn } from '@/lib/utils'

const REGIONS = [
  { code: 'BD', label: 'Bangladesh' },
  { code: 'IN', label: 'India' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'JP', label: 'Japan' },
]

const ACCENTS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: 'rose', label: 'Rose', swatch: 'bg-[oklch(0.645_0.246_16.44)]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-[oklch(0.769_0.188_70.08)]' },
  { id: 'violet', label: 'Violet', swatch: 'bg-[oklch(0.606_0.25_292.72)]' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-[oklch(0.696_0.17_162.48)]' },
]

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  const s = useSettings()
  const [instances, setInstances] = useState<InstanceStatus[] | null>(null)
  const [testing, setTesting] = useState(true)

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

  const testInstances = () => {
    setTesting(true)
    fetch('/api/instances')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { instances: InstanceStatus[] }) => setInstances(d.instances || []))
      .catch(() => toast.error('Could not test instances'))
      .finally(() => setTesting(false))
  }

  useEffect(() => {
    applyAccent(s.accent)
  }, [s.accent])

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
      <h1 className="text-2xl font-extrabold tracking-tight mb-6">Settings</h1>

      {/* Appearance */}
      <section aria-label="Appearance" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Waves className="h-4 w-4 text-primary" /> Appearance
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="theme-select">Theme</Label>
              <p className="text-xs text-muted-foreground">Dark is recommended for listening at night.</p>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="theme-select" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">
                  <Moon className="mr-1 inline h-3.5 w-3.5" /> Dark
                </SelectItem>
                <SelectItem value="light">
                  <Sun className="mr-1 inline h-3.5 w-3.5" /> Light
                </SelectItem>
                <SelectItem value="system">
                  <Monitor className="mr-1 inline h-3.5 w-3.5" /> System
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Accent color</Label>
              <p className="text-xs text-muted-foreground">Used across the app UI.</p>
            </div>
            <div className="flex gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    s.setAccent(a.id)
                    applyAccent(a.id)
                  }}
                  className={cn(
                    'h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all',
                    a.swatch,
                    s.accent === a.id ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/40'
                  )}
                  aria-label={`Accent ${a.label}`}
                  aria-pressed={s.accent === a.id}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Playback */}
      <section aria-label="Playback" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Zap className="h-4 w-4 text-primary" /> Playback
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="mode-select">Audio engine</Label>
              <p className="text-xs text-muted-foreground">
                Stable: YouTube&apos;s official embedded player (always works). Hi-Fi: direct stream with
                equalizer — experimental, falls back automatically.
              </p>
            </div>
            <Select value={s.playbackMode} onValueChange={(v: any) => s.setPlaybackMode(v)}>
              <SelectTrigger id="mode-select" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iframe">Stable</SelectItem>
                <SelectItem value="hifi">Hi-Fi (beta)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="region-select">Music region</Label>
              <p className="text-xs text-muted-foreground">Curates your home feed.</p>
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
              <Label htmlFor="mini-art">Show art in mini player</Label>
            </div>
            <Switch id="mini-art" checked={s.showMiniArt} onCheckedChange={s.setShowMiniArt} />
          </div>
        </div>
      </section>

      {/* Equalizer */}
      <section aria-label="Equalizer" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Equal className="h-4 w-4 text-primary" /> Equalizer
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          10-band EQ — active in Hi-Fi mode. Presets: {Object.keys(EQ_PRESETS).join(', ')}.
        </p>
        <div className="mb-4">
          <Select value={s.eqPreset} onValueChange={(v: EqPreset) => s.setEqPreset(v)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EQ_PRESETS) as Exclude<EqPreset, 'custom'>[]).map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
              {s.eqPreset === 'custom' && <SelectItem value="custom">Custom</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className={cn('flex justify-between gap-2', s.playbackMode !== 'hifi' && 'opacity-40 pointer-events-none')}>
          {s.eqGains.map((g, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1">
              <Slider
                orientation="vertical"
                value={[g]}
                min={-12}
                max={12}
                step={0.5}
                onValueChange={(v) => s.setEqGain(i, v[0])}
                className="h-24"
                aria-label={`${EQ_FREQUENCIES[i]}Hz`}
              />
              <span className="text-[10px] text-muted-foreground">
                {EQ_FREQUENCIES[i] >= 1000 ? `${EQ_FREQUENCIES[i] / 1000}k` : EQ_FREQUENCIES[i]}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {s.playbackMode !== 'hifi'
            ? 'Switch audio engine to Hi-Fi to enable the equalizer.'
            : 'EQ applies live to Hi-Fi playback.'}
        </p>
      </section>

      {/* Network */}
      <section aria-label="Network" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <RadioTower className="h-4 w-4 text-primary" /> Music network
          </h2>
          <Button variant="outline" size="sm" onClick={testInstances} disabled={testing} className="rounded-full">
            {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Re-test
          </Button>
        </div>
        {instances === null ? (
          <p className="text-xs text-muted-foreground">Testing music network instances…</p>
        ) : (
          <ul className="space-y-2">
            {instances.map((inst) => (
              <li key={inst.url} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={cn('h-2 w-2 rounded-full', inst.ok ? 'bg-emerald-500' : 'bg-destructive')}
                    aria-hidden
                  />
                  {inst.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {inst.ok ? `${inst.latencyMs} ms` : 'down'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Dhun automatically falls back between free community instances. Playback always uses
          YouTube&apos;s official embedded player.
        </p>
      </section>

      {/* App */}
      <section aria-label="App" className="mb-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Download className="h-4 w-4 text-primary" /> App
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full gap-1.5"
            onClick={async () => {
              const res = await triggerInstall()
              if (res === 'unavailable')
                toast.info('Install from browser menu', {
                  description: 'Chrome/Edge: ⋮ → “Install app”. iOS: Share → Add to Home Screen.',
                })
            }}
          >
            <Download className="h-4 w-4" /> Install Dhun
          </Button>
          <Button variant="outline" className="rounded-full gap-1.5" onClick={clearCache}>
            <Trash2 className="h-4 w-4" /> Clear offline cache
          </Button>
        </div>
      </section>

      <Separator className="my-6" />

      <section aria-label="About" className="text-center text-xs text-muted-foreground">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl">
          🎵
        </div>
        <p className="font-semibold text-foreground">Dhun v1.0</p>
        <p className="mt-1 max-w-sm mx-auto">
          A free, open music platform built on public APIs: Piped (metadata), LRCLIB (synced lyrics),
          iTunes (artwork) and YouTube&apos;s official embedded player. No ads, no account, no tracking.
        </p>
        <p className="mt-2">Made with ♥ for listeners</p>
      </section>
    </div>
  )
}
