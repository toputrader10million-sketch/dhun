'use client'

/**
 * Global keyboard shortcuts (Days 5-6, PLAN-60).
 *
 *  Space            play / pause
 *  ArrowRight / Left  seek +10s / -10s
 *  Shift+Right / Left  next / previous track
 *  J / L            previous / next track
 *  ArrowUp / Down   volume +5% / -5%
 *  M                mute toggle
 *  S                shuffle toggle
 *  R                repeat mode cycle (off -> all -> one)
 *  /                jump to the search view
 *  ?                open the keyboard shortcuts help dialog
 *
 * Guards:
 *  - Nothing runs while typing in an input / textarea / select /
 *    contenteditable, or when focus is inside a [role="dialog"] (the dialog —
 *    e.g. the shortcuts help — handles its own keys such as Escape via Radix).
 *  - Escape is never intercepted here.
 *  - Key repeat is ignored for toggles and track skips (holding Space must not
 *    machine-gun play/pause); seek and volume intentionally repeat so the key
 *    can be held to scrub / ramp volume.
 *  - Combos with Ctrl / Cmd / Alt are left to the browser and OS entirely.
 */
import { useEffect } from 'react'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useShortcutsDialog } from '@/components/shortcuts-dialog'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function insideDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"]') !== null
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // 1) Never intercept browser/editor shortcuts built on Ctrl, Cmd or Alt.
      //    (Shift stays allowed — Shift+Arrow skips tracks.)
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // 2) Escape always belongs to the focused widget (dialogs close themselves).
      if (e.key === 'Escape') return
      // 3) Ignore typing surfaces and any open dialog.
      if (isEditableTarget(e.target) || insideDialog(e.target)) return

      const player = usePlayer.getState()

      switch (e.key) {
        case ' ': {
          // Even in a failed-playback state calling togglePlay is safe —
          // the store decides what to do (resumes / restarts / no-ops).
          if (!e.repeat) player.togglePlay()
          e.preventDefault()
          break
        }
        case 'ArrowRight': {
          if (e.shiftKey) {
            if (!e.repeat) player.next()
          } else {
            player.seekBy(10)
          }
          e.preventDefault()
          break
        }
        case 'ArrowLeft': {
          if (e.shiftKey) {
            if (!e.repeat) player.prev()
          } else {
            player.seekBy(-10)
          }
          e.preventDefault()
          break
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          const wasMuted = usePlayer.getState().muted
          const current = useSettings.getState().volume
          if (wasMuted) usePlayer.getState().toggleMute() // restore pre-mute volume first
          const base = wasMuted ? 0 : current
          const delta = e.key === 'ArrowUp' ? 5 : -5
          const nextVol = Math.max(0, Math.min(100, base + delta))
          usePlayer.getState().setVolume(nextVol)
          e.preventDefault()
          break
        }
        case 'm':
        case 'M': {
          if (!e.repeat) player.toggleMute()
          e.preventDefault()
          break
        }
        case 's':
        case 'S': {
          if (!e.repeat) player.toggleShuffle()
          e.preventDefault()
          break
        }
        case 'r':
        case 'R': {
          if (!e.repeat) player.cycleRepeat()
          e.preventDefault()
          break
        }
        case 'j':
        case 'J': {
          if (!e.repeat) player.prev()
          e.preventDefault()
          break
        }
        case 'l':
        case 'L': {
          if (!e.repeat) player.next()
          e.preventDefault()
          break
        }
        case '/': {
          useUi.getState().goSearch()
          e.preventDefault()
          break
        }
        case '?': {
          useShortcutsDialog.getState().setOpen(true)
          e.preventDefault()
          break
        }
        default:
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
