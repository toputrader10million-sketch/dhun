'use client'

/**
 * Keyboard shortcuts help dialog (Days 5-6 accessibility work).
 * The open state lives in a tiny module-level zustand store so both the
 * global keyboard hook ("?" key) and the sidebar button can open it without
 * prop drilling.
 */
import { create } from 'zustand'
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ShortcutsDialogState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useShortcutsDialog = create<ShortcutsDialogState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

interface ShortcutRow {
  keys: string[]
  action: string
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ['Space'], action: 'Play / pause' },
  { keys: ['→'], action: 'Seek forward 10 seconds' },
  { keys: ['←'], action: 'Seek back 10 seconds' },
  { keys: ['Shift', '→'], action: 'Next track' },
  { keys: ['Shift', '←'], action: 'Previous track' },
  { keys: ['J'], action: 'Previous track' },
  { keys: ['L'], action: 'Next track' },
  { keys: ['↑'], action: 'Volume up 5%' },
  { keys: ['↓'], action: 'Volume down 5%' },
  { keys: ['M'], action: 'Mute / unmute' },
  { keys: ['S'], action: 'Shuffle on / off' },
  { keys: ['R'], action: 'Repeat mode (off, all, one)' },
  { keys: ['/'], action: 'Go to search' },
  { keys: ['?'], action: 'Show this help' },
]

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 font-sans text-xs font-medium text-foreground">
      {children}
    </kbd>
  )
}

export function ShortcutsDialog() {
  const open = useShortcutsDialog((s) => s.open)
  const setOpen = useShortcutsDialog((s) => s.setOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Use these keys anywhere in the app. Shortcuts are ignored while typing in a
            search box or form field.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2" aria-label="List of keyboard shortcuts">
          {SHORTCUTS.map((s) => (
            <li
              key={`${s.keys.join('+')}-${s.action}`}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (
                  <Kbd key={`${k}-${i}`}>{k}</Kbd>
                ))}
              </span>
              <span className="text-right text-muted-foreground">{s.action}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
