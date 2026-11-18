'use client'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Send, Sparkles, X } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TrackRow } from '@/components/track-row'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import type { MusicItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  tracks?: MusicItem[]
  chips?: string[]
  source?: 'ai' | 'rules'
}

const GREETING: ChatMsg = {
  role: 'assistant',
  text:
    "Hi! I'm Dhun Copilot. I can find music for any mood or language, and explain how anything in the app works. What are you in the mood for?",
  chips: [
    'Suggest a workout mix',
    'Play something Bangla',
    'How do offline downloads work?',
    'What themes are available?',
  ],
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label="Copilot is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  )
}

export function CopilotDock() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const current = usePlayer((s) => s.queue[s.index])
  const view = useUi((s) => s.view)
  const region = useSettings((s) => s.region)

  // Keep the latest message in view while chatting
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, busy])

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || busy) return
    setInput('')
    const userMsg: ChatMsg = { role: 'user', text }
    const history = messages
      .filter((m) => m !== GREETING)
      .map((m) => ({ role: m.role, content: m.text }))
    setMessages((prev) => [...prev, userMsg])
    setBusy(true)
    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          context: {
            currentTrack: current ? { title: current.title, artist: current.artist, source: current.source } : undefined,
            view,
            region,
          },
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as {
        reply: string
        tracks?: MusicItem[]
        chips?: string[]
        source?: 'ai' | 'rules'
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply,
          tracks: Array.isArray(data.tracks) ? data.tracks : [],
          chips: Array.isArray(data.chips) ? data.chips : [],
          source: data.source,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: "I couldn't reach the AI service just now. Check your connection and try again — everything else keeps working.",
          chips: ['Try again', 'How do downloads work?'],
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Floating dock button — sits above the player chrome on every breakpoint */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-40 z-40 lg:bottom-20 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform duration-150 active:scale-90"
        aria-label="Open Dhun Copilot"
        aria-haspopup="dialog"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26, delay: 0.4 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
      >
        <Bot className="h-5 w-5" aria-hidden />
        <span
          className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-background animate-pulse"
          aria-hidden
        />
      </motion.button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[82dvh] lg:mx-auto lg:max-w-2xl">
          <div className="flex h-full flex-col">
            {/* header */}
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Bot className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-sm font-bold leading-tight">Dhun Copilot</DrawerTitle>
                <DrawerDescription className="text-xs text-muted-foreground leading-tight">
                  Find music · app guide · honest answers
                </DrawerDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close Copilot">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* messages */}
            <div ref={listRef} className="dhun-scroll flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'dhun-fade-slim max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-accent/70 text-foreground rounded-bl-md'
                    )}
                  >
                    {m.text}
                  </div>

                  {/* track results */}
                  {m.tracks && m.tracks.length > 0 && (
                    <div className="w-full rounded-2xl border bg-card/60 p-1.5 space-y-0.5">
                      <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Tap to play
                      </p>
                      {m.tracks.map((it, ti) => (
                        <TrackRow key={`${it.id}-${ti}`} item={it} index={ti} context={m.tracks} />
                      ))}
                    </div>
                  )}

                  {/* follow-up chips */}
                  {m.chips && m.chips.length > 0 && !busy && i === messages.length - 1 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {m.chips.map((c) => (
                        <button
                          key={c}
                          onClick={() => send(c)}
                          className="rounded-full border bg-accent/40 px-3 py-1.5 text-xs text-foreground/90 transition-[background-color,transform] hover:bg-accent active:scale-95"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="inline-flex items-center gap-2 rounded-2xl bg-accent/70 px-3.5 py-2.5">
                  <TypingDots />
                </div>
              )}
            </div>

            {/* composer */}
            <div className="border-t px-3 py-3 pb-safe">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Copilot — a mood, a language, or a how-to…"
                  aria-label="Message Dhun Copilot"
                  className="h-11 flex-1 rounded-xl bg-accent/50 border-0"
                  maxLength={500}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={busy || !input.trim()}
                  className="h-11 w-11 shrink-0 rounded-xl"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" aria-hidden />
                </Button>
              </form>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Sparkles className="h-3 w-3" aria-hidden /> AI suggestions are informational — playback uses the same free catalogs as search.
              </p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
