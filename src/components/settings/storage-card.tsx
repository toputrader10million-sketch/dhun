'use client'
/* Dhun — Day 48: Storage manager card (Settings).
 * Quota bar, per-cache inventory with lazy byte measurement, offline downloads
 * summary, LRU auto-evict toggle, and honest per-cache clear actions.
 */
import { useCallback, useEffect, useState } from 'react'
import { HardDrive, Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  clearCacheByName,
  estimateStorage,
  listCaches,
  measureCache,
  type CacheInfo,
  type StorageSnapshot,
} from '@/lib/storage-manager'
import { useOffline } from '@/store/offline'
import { useSettings } from '@/store/settings'
import { useT } from '@/lib/i18n'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Friendly cache names (sw.js cache keys). */
function cacheLabel(name: string, t: (k: string) => string): string {
  if (/audio/i.test(name)) return t('Offline audio cache')
  if (/art/i.test(name)) return t('Artwork cache')
  if (/shell|static|runtime|precache/i.test(name)) return t('App shell cache')
  return name
}

export function StorageCard() {
  const t = useT()
  const [snap, setSnap] = useState<StorageSnapshot | null>(null)
  const [caches, setCaches] = useState<CacheInfo[]>([])
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const offlineItems = useOffline((s) => s.items)
  const offlineRefresh = useOffline((s) => s.refresh)
  const autoEvict = useSettings((s) => s.storageAutoEvict)
  const setAutoEvict = useSettings((s) => s.setStorageAutoEvict)
  const offlineBytes = offlineItems.reduce((sum, item) => sum + (item.size || 0), 0)

  const load = useCallback(async () => {
    setSnap(await estimateStorage())
    setCaches(await listCaches())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const measure = async (name: string) => {
    setBusy(name)
    try {
      const bytes = await measureCache(name)
      setMeasured((m) => ({ ...m, [name]: bytes }))
    } finally {
      setBusy(null)
    }
  }

  const clearOne = async (name: string) => {
    setBusy(name)
    try {
      const ok = await clearCacheByName(name)
      if (ok) {
        toast.success(t('Cache cleared'), { description: cacheLabel(name, t) })
        setMeasured((m) => {
          const next = { ...m }
          delete next[name]
          return next
        })
        await load()
      } else {
        toast.error(t('Could not clear cache'))
      }
    } finally {
      setBusy(null)
    }
  }

  const pct = snap && snap.quota > 0 ? Math.min(100, Math.round((snap.usage / snap.quota) * 100)) : null
  const barColor = pct === null ? 'bg-primary' : pct >= 80 ? 'bg-destructive' : pct >= 60 ? 'bg-amber-500' : 'bg-primary'

  return (
    <section aria-label="Storage" className="mb-6 rounded-2xl border p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <HardDrive className="h-4 w-4 text-primary" /> {t('Storage')}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('What Dhun keeps on this device — downloads, cached artwork and the app shell.')}
      </p>

      {/* quota bar */}
      {snap?.supported ? (
        <div className="mb-4">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-accent"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? 0}
            aria-label={t('Storage used')}
          >
            <div className={cn('h-full rounded-full transition-[width] duration-500', barColor)} style={{ width: `${Math.max(2, pct ?? 2)}%` }} />
          </div>
          <p className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              ≈ {formatBytes(snap.usage)} {t('of')} {formatBytes(snap.quota)}
              {pct !== null ? ` · ${pct}%` : ''}
            </span>
            <button onClick={() => void load()} className="underline underline-offset-2 hover:text-foreground">
              {t('Refresh')}
            </button>
          </p>
        </div>
      ) : (
        <p className="mb-4 text-[11px] text-muted-foreground">
          {t('This browser does not expose storage quota numbers — cache contents are still manageable below.')}
        </p>
      )}

      {/* offline downloads summary */}
      <div className="mb-4 rounded-xl border bg-accent/20 p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{t('Offline downloads')}</span>
          <span className="text-muted-foreground">
            {offlineItems.length} {t('tracks')} · {formatBytes(offlineBytes)}
          </span>
        </div>
        {/* LRU auto-evict toggle */}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="storage-auto-evict" className="text-xs">
              {t('Auto-evict least played')}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {t('When storage passes 80% of quota, least-played downloads are removed first (last-played time, then cache date).')}
            </p>
          </div>
          <Switch id="storage-auto-evict" checked={autoEvict} onCheckedChange={setAutoEvict} />
        </div>
      </div>

      {/* cache inventory */}
      {caches.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          {caches.map((c) => {
            const isOpen = expanded === c.name
            return (
              <div key={c.name} className="border-b last:border-b-0">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setExpanded(isOpen ? null : c.name)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 truncate text-xs font-medium">{cacheLabel(c.name, t)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {c.entries} {t('items')}
                      {measured[c.name] !== undefined ? ` · ${formatBytes(measured[c.name])}` : ''}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 rounded-full px-2 text-muted-foreground"
                    onClick={() => void clearOne(c.name)}
                    disabled={busy === c.name}
                    aria-label={`${t('Clear')} ${cacheLabel(c.name, t)}`}
                  >
                    {busy === c.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {isOpen && measured[c.name] === undefined && (
                  <div className="px-3 pb-3">
                    <Button variant="secondary" size="sm" className="rounded-full text-xs" onClick={() => void measure(c.name)} disabled={busy === c.name}>
                      {busy === c.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {t('Measure exact size')}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t('No caches yet — they fill up as you listen and download.')}</p>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        {t('Clearing a cache never touches your favorites, playlists or history — only re-downloadable media.')}
      </p>
    </section>
  )
}
