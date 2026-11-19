'use client'
/* Dhun — Day 46: custom install sheet.
 *
 * Replaces the raw browser mini-infobar with a branded bottom sheet:
 *  - Chromium: fires on the captured beforeinstallprompt event (Install button
 *    calls prompt(); result toasted honestly — accepted/dismissed).
 *  - iOS Safari: no beforeinstallprompt exists, so we show honest manual steps
 *    (Share → Add to Home Screen) instead of pretending to install.
 *  - Never shows when already running installed (display-mode: standalone),
 *    and a dismissal snoozes the sheet for 7 days (not a nag loop).
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AudioWaveform, Download, Heart, WifiOff, X, Share2, PlusSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { triggerInstall, useInstall } from '@/components/pwa/register-sw'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const SNOOZE_KEY = 'dhun-install-snooze'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
const SHOW_DELAY_MS = 4000

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

function isIOS(): boolean {
  try {
    const w = window as unknown as { MSStream?: unknown }
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !w.MSStream
  } catch {
    return false
  }
}

function snoozedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) ?? '0')
    return at > 0 && Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

export function InstallSheet() {
  const t = useT()
  const reduceMotion = !!useReducedMotion()
  const canInstall = useInstall((s) => s.canInstall)
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<'prompt' | 'ios'>('prompt')
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const decide = () => {
      if (isStandalone() || snoozedRecently()) return
      if (isIOS()) {
        // iOS: never auto-nag — first visit shows the manual guide once, and
        // the snooze applies after dismissal like everywhere else.
        setMode('ios')
        setVisible(true)
      }
      // Chromium path opens from the `canInstall` subscription below.
    }
    const timer = setTimeout(decide, SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!canInstall) return
    // setState inside a timer callback (not the effect body) keeps the
    // hooks lint rule happy and lets hydration settle first.
    const id = setTimeout(() => {
      if (!isStandalone() && !snoozedRecently()) {
        setMode('prompt')
        setVisible(true)
      }
    }, 250)
    return () => clearTimeout(id)
  }, [canInstall])

  useEffect(() => {
    const onInstalled = () => {
      setVisible(false)
      toast.success(t('Dhun installed'), { description: t('Find it on your home screen — it runs full-screen and offline-aware.') })
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [t])

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    } catch {}
  }

  const install = async () => {
    setInstalling(true)
    const outcome = await triggerInstall()
    setInstalling(false)
    if (outcome === 'accepted') {
      setVisible(false)
    } else if (outcome === 'dismissed') {
      toast(t('Install dismissed'), { description: t('You can install anytime from Settings → Install app.') })
      dismiss()
    } else {
      toast(t('Install not available here'), {
        description: t('This browser is not offering the install flow right now — on iPhone use Share → Add to Home Screen.'),
      })
    }
  }

  if (!visible) return null

  return (
    <>
      {/* sheet backdrop-less bottom card — above mini player, below dialogs */}
      <AnimatePresence>
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed inset-x-3 bottom-24 z-[55] mx-auto max-w-md lg:inset-x-auto lg:left-72 lg:bottom-6"
          role="dialog"
          aria-label={t('Install Dhun')}
        >
          <div className="rounded-2xl border bg-card/95 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <AudioWaveform className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">{t('Install Dhun')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mode === 'ios'
                    ? t('Add Dhun to your home screen for full-screen, app-like playback.')
                    : t('Full-screen playback, offline downloads and a home-screen icon — no app store needed.')}
                </p>
              </div>
              <button
                onClick={dismiss}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t('Close')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {mode === 'ios' ? (
              <ol className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Share2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {t('Tap the Share button in Safari')}
                </li>
                <li className="flex items-center gap-2">
                  <PlusSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {t('Choose "Add to Home Screen"')}
                </li>
              </ol>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
                <li className="flex items-center gap-1.5"><WifiOff className="h-3 w-3 text-primary" /> {t('Works offline')}</li>
                <li className="flex items-center gap-1.5"><Heart className="h-3 w-3 text-primary" /> {t('Free forever')}</li>
                <li className="flex items-center gap-1.5"><Download className="h-3 w-3 text-primary" /> {t('Background play')}</li>
              </ul>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={dismiss}>
                {t('Not now')}
              </Button>
              <Button
                size="sm"
                className={cn('rounded-full gap-1.5 font-semibold')}
                onClick={mode === 'prompt' ? () => void install() : dismiss}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {mode === 'prompt' ? (installing ? t('Installing…') : t('Install')) : t('Got it')}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
