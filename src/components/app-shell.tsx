'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { ThemeProvider } from 'next-themes'
import { Home, Library as LibraryIcon, Compass, Settings, WifiOff, AudioWaveform, RadioTower } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import RegisterSW from '@/components/pwa/register-sw'
import { MiniPlayer } from '@/components/player/mini-player'
import { NowPlaying } from '@/components/player/now-playing'
import { VideoBubble } from '@/components/player/video-bubble'
import { HomeView } from '@/views/home-view'
import { ExploreView } from '@/views/explore-view'
import { LibraryView } from '@/views/library-view'
import { NetworkView } from '@/views/network-view'
import { SettingsView } from '@/views/settings-view'
import { useUi, type ViewId } from '@/store/ui'
import { usePlayer } from '@/store/player'
import { useSettings, applyAccent } from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useCast } from '@/lib/cast'
import { cn } from '@/lib/utils'

const NAV: { id: ViewId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'network', label: 'Network', icon: RadioTower },
  { id: 'settings', label: 'Settings', icon: Settings },
]

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

export function AppShell() {
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const goSearch = useUi((s) => s.goSearch)
  const initPlayer = usePlayer((s) => s.init)
  const accent = useSettings((s) => s.accent)
  const region = useSettings((s) => s.region)

  // Init engines + media session once
  useEffect(() => {
    initPlayer()
  }, [initPlayer])

  // Hydrate offline registry + cast framework once
  useEffect(() => {
    useOffline.getState().hydrate()
    useCast.getState().actions.init()
  }, [])

  // Apply accent color
  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <RegisterSW />
      <Toaster position="bottom-center" richColors closeButton />
      <OfflineBanner />

      <div className="min-h-screen">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r bg-card/50 px-3 py-4 md:flex">
          <button
            className="mb-6 flex items-center gap-2.5 px-2 text-left"
            onClick={() => setView('home')}
            aria-label="Dhun home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <AudioWaveform className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-extrabold leading-none tracking-tight">Dhun</span>
              <span className="block text-[10px] text-muted-foreground">free music platform</span>
            </span>
          </button>
          <nav className="flex flex-col gap-1" aria-label="Main navigation">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  view === n.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
                aria-current={view === n.id ? 'page' : undefined}
              >
                <n.icon className="h-4.5 w-4.5" /> {n.label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => goSearch()}
            className="mt-4 flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
          >
            <Home className="hidden" />
            <Compass className="h-4.5 w-4.5" /> Search anything…
          </button>
          <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground/80">Built on free APIs</p>
            <p>Piped • Audius • LRCLIB • iTunes • YouTube embed</p>
          </div>
        </aside>

        {/* Main column */}
        <div className="md:pl-60 flex min-h-screen flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/95 backdrop-blur px-4 py-3 md:hidden">
            <button className="flex items-center gap-2" onClick={() => setView('home')} aria-label="Dhun home">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <AudioWaveform className="h-4.5 w-4.5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight">Dhun</span>
            </button>
            <button
              onClick={() => goSearch()}
              className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-muted-foreground"
              aria-label="Search"
            >
              <Compass className="h-4 w-4" /> Search
            </button>
          </header>

          <main className="flex-1 pb-44 md:pb-28" id="main-content">
            {view === 'home' && <HomeView key={region} />}
            {view === 'explore' && <ExploreView />}
            {view === 'library' && <LibraryView />}
            {view === 'network' && <NetworkView />}
            {view === 'settings' && <SettingsView />}
          </main>

          {/* Footer note (desktop) */}
          <footer className="mt-auto hidden md:block border-t px-6 py-3 text-center text-[11px] text-muted-foreground">
            Dhun — a free PWA music platform. Metadata by Piped, indie catalog by Audius, lyrics by LRCLIB,
            artwork by iTunes, playback via YouTube&apos;s official embedded player. No ads. No tracking.
          </footer>
        </div>

        {/* Player chrome */}
        <MiniPlayer />
        <NowPlaying />

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-background/95 backdrop-blur md:hidden pb-safe"
          aria-label="Bottom navigation"
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                view === n.id ? 'text-primary' : 'text-muted-foreground'
              )}
              aria-current={view === n.id ? 'page' : undefined}
            >
              <n.icon className={cn('h-5 w-5', view === n.id && 'fill-accent')} />
              {n.label}
            </button>
          ))}
        </nav>

        {/* Visible YouTube player bubble (official embed, audio-first) */}
        <VideoBubble />
      </div>
    </ThemeProvider>
  )
}
