'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { ThemeProvider } from 'next-themes'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Home, Library as LibraryIcon, Compass, Settings, WifiOff, AudioWaveform, RadioTower, Keyboard, BarChart3 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import RegisterSW from '@/components/pwa/register-sw'
import { MiniPlayer } from '@/components/player/mini-player'
import { NowPlaying } from '@/components/player/now-playing'
import { VideoBubble } from '@/components/player/video-bubble'
import { useShortcutsDialog } from '@/components/shortcuts-dialog'
// Day 47 — below-fold dialog chrome is code-split out of the first-load bundle
const ShortcutsDialog = dynamic(() => import('@/components/shortcuts-dialog').then((m) => m.ShortcutsDialog), { ssr: false })
import { CopilotDock } from '@/components/copilot/copilot-dock'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { HomeView } from '@/views/home-view'
import { ExploreView } from '@/views/explore-view'
import { ChartsView } from '@/views/charts-view'
import { LibraryView } from '@/views/library-view'
import { NetworkView } from '@/views/network-view'
import { SettingsView } from '@/views/settings-view'
import { ArtistView } from '@/views/artist-view'
import { SharedPlaylistView } from '@/views/shared-view'
import { DesktopWidget } from '@/components/player/desktop-widget'
import { HandoffNudge } from '@/components/player/handoff-nudge'
import { OnboardingTour } from '@/components/onboarding-tour'
import { InstallSheet } from '@/components/pwa/install-sheet'
import { handleProtocolLink } from '@/lib/pwa-links'
import { useUi, type ViewId } from '@/store/ui'
import { usePlayer } from '@/store/player'
import { useSettings, applyAccent, eqGainsFor } from '@/store/settings'
import { ProSheet, useProSheet } from '@/components/premium/pro-sheet'
import { ProCrown, ProBadge } from '@/components/premium/pro-badge'
import { useOffline } from '@/store/offline'
import { useDegraded } from '@/store/degraded'
import { useSmartDownloads } from '@/lib/smart-downloads'
import { autoEvictIfNeeded } from '@/lib/storage-manager'
import { trackSession } from '@/lib/usage-stats'
import { hifiEngine } from '@/engine/hifi'
import { useCast } from '@/lib/cast'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const NAV: { id: ViewId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'charts', label: 'Charts', icon: BarChart3 },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'network', label: 'Network', icon: RadioTower },
  { id: 'settings', label: 'Settings', icon: Settings },
]

/** Day 45 — views reachable via manifest shortcuts (/?view=…) */
const DEEP_VIEWS: ViewId[] = ['home', 'explore', 'charts', 'library', 'network', 'settings']

/* Shared spring for nav indicators — snappy slide, no overshoot bounce */
const NAV_SPRING = { type: 'spring' as const, stiffness: 520, damping: 42 }

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function OfflineBanner() {
  const t = useT()
  // useSyncExternalStore avoids hydration mismatch: server snapshot = online
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  )
  if (online) return null
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-xs text-white">
      <WifiOff className="h-3.5 w-3.5" /> {t("You're offline — some features are limited.")}
    </div>
  )
}

/** Q1.3 — honest amber notice when a route served stale cache because an
 * upstream circuit breaker is open (auto-clears 90s after the last notice). */
function DegradedBanner() {
  const t = useT()
  const degraded = useDegraded((s) => s.current)
  const clear = useDegraded((s) => s.clear)
  if (!degraded) return null
  return (
    <button
      onClick={clear}
      className="sticky top-0 z-50 flex w-full items-center justify-center gap-2 bg-amber-500/90 px-3 py-1.5 text-left text-xs text-amber-950 transition-[opacity] hover:opacity-90"
      aria-live="polite"
      title={t('Tap to dismiss')}
    >
      <AudioWaveform className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {t('Upstream slow — showing cached data')} · {degraded.upstream}
      </span>
    </button>
  )
}

function ShortcutsButton() {
  const t = useT()
  const setOpen = useShortcutsDialog((s) => s.setOpen)
  return (
    <button
      onClick={() => setOpen(true)}
      className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-[background-color,transform] hover:bg-accent/60 hover:text-foreground active:scale-[0.97]"
      aria-haspopup="dialog"
      aria-label={t('Keyboard shortcuts')}
    >
      <Keyboard className="h-3.5 w-3.5" aria-hidden="true" /> {t('Keyboard shortcuts')}
    </button>
  )
}

export function AppShell() {
  const t = useT()
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const goSearch = useUi((s) => s.goSearch)
  const initPlayer = usePlayer((s) => s.init)
  const accent = useSettings((s) => s.accent)
  const customAccent = useSettings((s) => s.customAccent)
  const accentGradient = useSettings((s) => s.accentGradient)
  const appTheme = useSettings((s) => s.appTheme)
  const crossfade = useSettings((s) => s.crossfade)
  const region = useSettings((s) => s.region)
  const reduceMotion = !!useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const language = useSettings((s) => s.language)
  // Day 54 — Pro chrome signature (gold brand + crown chip)
  const pro = useSettings((s) => s.premium)

  // Global keyboard shortcuts (playback, navigation, help dialog)
  useKeyboardShortcuts()

  // Init engines + media session once
  useEffect(() => {
    initPlayer()
  }, [initPlayer])

  // Hydrate offline registry + cast framework once; kick off smart downloads (Day 23)
  useEffect(() => {
    useOffline.getState().hydrate()
    useCast.getState().actions.init()
    // Day 48 — storage pressure valve (no-op unless the user opted in)
    void autoEvictIfNeeded()
    // Day 55 — record today as an active session (usage dashboard + loyalty)
    trackSession()
    // Smart downloads: sweep favorites shortly after boot (throttled internally).
    const bootTimer = setTimeout(() => void useSmartDownloads.getState().sweep('boot'), 6000)
    const onOnline = () => void useSmartDownloads.getState().sweep('online')
    window.addEventListener('online', onOnline)
    return () => {
      clearTimeout(bootTimer)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Apply accent color (named palette, custom hex or gradient from the designer)
  useEffect(() => {
    applyAccent(accent, customAccent, accentGradient)
  }, [accent, customAccent, accentGradient])

  // Apply crossfade window to the Hi-Fi engine
  useEffect(() => {
    hifiEngine.setCrossfade(crossfade)
  }, [crossfade])

  // Day 25: apply EQ profile changes live to the running Hi-Fi engine
  const eqProfiles = useSettings((s) => s.eqProfiles)
  const currentSource = usePlayer((s) => s.queue[s.index]?.source)
  useEffect(() => {
    hifiEngine.setEqGains(eqGainsFor(eqProfiles, currentSource))
  }, [eqProfiles, currentSource])

  // Apply curated pro theme (CSS-variable set via <html data-app-theme>)
  useEffect(() => {
    document.documentElement.dataset.appTheme = appTheme
  }, [appTheme])

  // New view starts at the top (old view exits while we snap home)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  // Scroll-reactive header elevation (mobile/tablet)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Day 34 — deep link: /?p=<token> opens the public playlist viewer once on boot
  useEffect(() => {
    try {
      const token = new URLSearchParams(window.location.search).get('p')
      if (token && /^[A-Za-z0-9_-]{4,64}$/.test(token)) {
        useUi.getState().openShared(token)
      }
    } catch {
      /* noop */
    }
  }, [])

  // Day 43 — sync <html lang> for screen readers + font shaping
  useEffect(() => {
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en'
  }, [language])

  // Day 45 — PWA entry points: manifest shortcuts (/?view=…), share target
  // (Android share → /?share-target=1&title&text&url), protocol handler
  // (web+dhuun://play/yt/<id> → /?pwa-link=play/yt/<id>). One-time on boot,
  // consumed params are stripped so a reload never re-triggers them.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const params = url.searchParams
      const viewParam = params.get('view')
      if (viewParam && (DEEP_VIEWS as string[]).includes(viewParam)) {
        useUi.getState().setView(viewParam as ViewId)
      }
      let consumed = false
      if (params.has('share-target')) {
        consumed = true
        const shared = (params.get('url') ?? params.get('text') ?? params.get('title') ?? '').trim()
        if (shared) {
          useUi.getState().goSearch(shared)
          toast('Shared content received', {
            description: 'Search is prefilled — pick the result you want to play.',
          })
        }
        for (const k of ['share-target', 'url', 'text', 'title']) params.delete(k)
      }
      const link = params.get('pwa-link')
      if (link) {
        consumed = true
        params.delete('pwa-link')
        void handleProtocolLink(link)
      }
      if (consumed) {
        window.history.replaceState(null, '', url.pathname + params.toString())
      }
    } catch {
      /* noop */
    }
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <RegisterSW />
      <Toaster position="bottom-center" richColors closeButton />
      <OfflineBanner />
      <DegradedBanner />

      <div className="min-h-screen">
        {/* Desktop sidebar (from lg: tablets keep the roomy full-width layout) */}
        <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r bg-card/50 px-3 py-4 lg:flex">
          <button
            className="mb-6 flex items-center gap-2.5 px-2 text-left transition-transform duration-150 active:scale-[0.98]"
            onClick={() => setView('home')}
            aria-label="Dhun home"
          >
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground',
                pro
                  ? 'dhun-shimmer bg-gradient-to-br from-[oklch(0.88_0.13_95)] to-[oklch(0.64_0.13_70)] shadow-md shadow-amber-500/25'
                  : 'bg-primary'
              )}
            >
              <AudioWaveform className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span
                className={cn(
                  'block text-lg font-extrabold leading-none tracking-tight',
                  pro && 'bg-gradient-to-r from-[oklch(0.68_0.14_85)] to-[oklch(0.82_0.15_90)] bg-clip-text text-transparent'
                )}
              >
                Dhun
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {pro ? t('Dhun Pro') : t('free music platform')}
              </span>
            </span>
          </button>
          <nav className="flex flex-col gap-1" aria-label={t('Main navigation')}>
            {NAV.map((n) => {
              const active = view === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[color,transform] duration-150 active:scale-[0.98]',
                    active ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {active && (
                    <motion.span
                      layoutId="dhun-nav-pill"
                      className="absolute inset-0 rounded-xl bg-accent"
                      transition={NAV_SPRING}
                      aria-hidden
                    />
                  )}
                  <n.icon
                    className={cn(
                      'relative h-4.5 w-4.5 transition-colors',
                      active && 'text-primary'
                    )}
                    aria-hidden="true"
                  />
                  <span className="relative">{t(n.label)}</span>
                </button>
              )
            })}
          </nav>
          <ShortcutsButton />
          {/* Day 54 — Pro chip: shimmering crown for members, quiet unlock door otherwise */}
          <button
            onClick={() => useProSheet.getState().openSheet()}
            className={cn(
              'mt-4 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-[background-color,transform] active:scale-[0.98]',
              pro
                ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-yellow-500/5 text-foreground'
                : 'border-dashed text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
            aria-label={pro ? 'Dhun Pro active' : 'Dhun Pro — unlock'}
          >
            <ProCrown active={pro} size={16} muted={!pro} />
            <span className="flex-1 text-left">{pro ? t('Pro is active') : t('Unlock Dhun Pro')}</span>
            {!pro && <ProBadge />}
          </button>
          <button
            onClick={() => goSearch()}
            className="mt-4 flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-[background-color,color,transform] hover:bg-accent/60 hover:text-foreground active:scale-[0.98]"
          >
            <Home className="hidden" aria-hidden="true" />
            <Compass className="h-4.5 w-4.5" aria-hidden="true" /> {t('Search anything…')}
          </button>
          <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground/80">{t('Built on free APIs')}</p>
            <p>Piped • Audius • LRCLIB • iTunes • YouTube embed</p>
          </div>
        </aside>

        {/* Main column */}
        <div className="lg:pl-60 flex min-h-screen flex-col">
          {/* Mobile/tablet header — glass deepens + elevates once scrolled */}
          <header
            className={cn(
              'sticky top-0 z-40 flex items-center justify-between border-b bg-background/80 backdrop-blur px-4 py-3 transition-[background-color,box-shadow] duration-300 lg:hidden',
              scrolled && 'bg-background/95 shadow-lg shadow-black/10'
            )}
          >
            <button
              className="flex items-center gap-2 transition-transform duration-150 active:scale-[0.97]"
              onClick={() => setView('home')}
              aria-label="Dhun home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <AudioWaveform className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="text-lg font-extrabold tracking-tight">Dhun</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => useProSheet.getState().openSheet()}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-95',
                  pro
                    ? 'dhun-shimmer bg-gradient-to-br from-amber-400 to-yellow-500 shadow-sm shadow-amber-500/30'
                    : 'bg-accent text-amber-600 dark:text-amber-400'
                )}
                aria-label={pro ? 'Dhun Pro active' : 'Dhun Pro — unlock'}
              >
                <ProCrown active={pro} size={14} muted={!pro} />
              </button>
              <button
                onClick={() => goSearch()}
                className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-muted-foreground transition-[background-color,transform] active:scale-[0.95]"
                aria-label="Search"
              >
                <Compass className="h-4 w-4" aria-hidden="true" /> {t('Search')}
              </button>
            </div>
          </header>

          <main className="flex-1 pb-44 lg:pb-28" id="main-content">
            {/* Animated view transitions: exit → enter, transform-only, reduced-motion aware */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {view === 'home' && <HomeView key={region} />}
                {view === 'explore' && <ExploreView />}
                {view === 'charts' && <ChartsView />}
                {view === 'library' && <LibraryView />}
                {view === 'network' && <NetworkView />}
                {view === 'settings' && <SettingsView />}
                {view === 'artist' && <ArtistView />}
                {view === 'shared' && <SharedPlaylistView />}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Footer note (desktop) — mt-auto keeps it pinned on short pages */}
          <footer className="mt-auto hidden border-t px-6 py-3 text-center text-[11px] text-muted-foreground lg:block">
            {t("Dhun — a free PWA music platform. Metadata by Piped, indie catalog by Audius, lyrics by LRCLIB, artwork by iTunes, playback via YouTube's official embedded player. No ads. No tracking.")}
          </footer>
        </div>

        {/* Player chrome */}
        <MiniPlayer />
        <NowPlaying />
        {/* Day 31 — floating desktop now-playing widget with mini spectrum */}
        <DesktopWidget />

        {/* Keyboard shortcuts help dialog */}
        <ShortcutsDialog />

        {/* Dhun Copilot — AI assistant dock (Day 22) */}
        <CopilotDock />

        {/* Day 32 — proactive handoff resume nudge */}
        <HandoffNudge />

        {/* Day 40 — first-run 3-step tour (only for genuinely new users) */}
        <OnboardingTour />

        {/* Day 46 — custom install sheet (beforeinstallprompt / iOS guidance) */}
        <InstallSheet />

        {/* Day 52 — Pro upsell sheet (opened by any gated control app-wide) */}
        <ProSheet />

        {/* Mobile/tablet bottom nav — sliding accent rail + springy active icon */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-background/95 backdrop-blur lg:hidden pb-safe"
          aria-label={t('Bottom navigation')}
        >
          {NAV.map((n) => {
            const active = view === n.id
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors active:scale-95',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="dhun-nav-rail"
                    className="absolute top-0 h-0.5 w-10 rounded-full bg-primary"
                    transition={NAV_SPRING}
                    aria-hidden
                  />
                )}
                <motion.span
                  className="flex h-7 w-7 items-center justify-center"
                  animate={active ? { scale: 1.15, y: -1 } : { scale: 1, y: 0 }}
                  transition={NAV_SPRING}
                >
                  <n.icon className="h-5 w-5" aria-hidden="true" />
                </motion.span>
                {t(n.label)}
              </button>
            )
          })}
        </nav>

        {/* Visible YouTube player bubble (official embed, audio-first) */}
        <VideoBubble />
      </div>
    </ThemeProvider>
  )
}
