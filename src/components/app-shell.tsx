'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ThemeProvider } from 'next-themes'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Home, Library as LibraryIcon, Compass, Settings, WifiOff, AudioWaveform, RadioTower, Keyboard, BarChart3 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import RegisterSW from '@/components/pwa/register-sw'
import { MiniPlayer } from '@/components/player/mini-player'
import { NowPlaying } from '@/components/player/now-playing'
import { VideoBubble } from '@/components/player/video-bubble'
import { ShortcutsDialog, useShortcutsDialog } from '@/components/shortcuts-dialog'
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
import { useUi, type ViewId } from '@/store/ui'
import { usePlayer } from '@/store/player'
import { useSettings, applyAccent, eqGainsFor } from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useSmartDownloads } from '@/lib/smart-downloads'
import { hifiEngine } from '@/engine/hifi'
import { useCast } from '@/lib/cast'
import { cn } from '@/lib/utils'

const NAV: { id: ViewId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'charts', label: 'Charts', icon: BarChart3 },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'network', label: 'Network', icon: RadioTower },
  { id: 'settings', label: 'Settings', icon: Settings },
]

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
  // useSyncExternalStore avoids hydration mismatch: server snapshot = online
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  )
  if (online) return null
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-xs text-white">
      <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline — some features are limited.
    </div>
  )
}

function ShortcutsButton() {
  const setOpen = useShortcutsDialog((s) => s.setOpen)
  return (
    <button
      onClick={() => setOpen(true)}
      className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-[background-color,transform] hover:bg-accent/60 hover:text-foreground active:scale-[0.97]"
      aria-haspopup="dialog"
      aria-label="Keyboard shortcuts"
    >
      <Keyboard className="h-3.5 w-3.5" aria-hidden="true" /> Keyboard shortcuts
    </button>
  )
}

export function AppShell() {
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

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <RegisterSW />
      <Toaster position="bottom-center" richColors closeButton />
      <OfflineBanner />

      <div className="min-h-screen">
        {/* Desktop sidebar (from lg: tablets keep the roomy full-width layout) */}
        <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r bg-card/50 px-3 py-4 lg:flex">
          <button
            className="mb-6 flex items-center gap-2.5 px-2 text-left transition-transform duration-150 active:scale-[0.98]"
            onClick={() => setView('home')}
            aria-label="Dhun home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <AudioWaveform className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-extrabold leading-none tracking-tight">Dhun</span>
              <span className="block text-[10px] text-muted-foreground">free music platform</span>
            </span>
          </button>
          <nav className="flex flex-col gap-1" aria-label="Main navigation">
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
                  <span className="relative">{n.label}</span>
                </button>
              )
            })}
          </nav>
          <ShortcutsButton />
          <button
            onClick={() => goSearch()}
            className="mt-4 flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-[background-color,color,transform] hover:bg-accent/60 hover:text-foreground active:scale-[0.98]"
          >
            <Home className="hidden" aria-hidden="true" />
            <Compass className="h-4.5 w-4.5" aria-hidden="true" /> Search anything…
          </button>
          <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground/80">Built on free APIs</p>
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
            <button
              onClick={() => goSearch()}
              className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-muted-foreground transition-[background-color,transform] active:scale-[0.95]"
              aria-label="Search"
            >
              <Compass className="h-4 w-4" aria-hidden="true" /> Search
            </button>
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
            Dhun — a free PWA music platform. Metadata by Piped, indie catalog by Audius, lyrics by LRCLIB,
            artwork by iTunes, playback via YouTube&apos;s official embedded player. No ads. No tracking.
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

        {/* Mobile/tablet bottom nav — sliding accent rail + springy active icon */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-background/95 backdrop-blur lg:hidden pb-safe"
          aria-label="Bottom navigation"
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
                {n.label}
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
