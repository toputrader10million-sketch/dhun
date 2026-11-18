'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/* ---------- Minimal Web Speech API typings (not in every TS DOM lib) ---------- */
interface SpeechRecognitionAlternativeLike {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionErrorEventLike {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type VoiceError =
  | 'not-allowed'
  | 'no-speech'
  | 'network'
  | 'not-available'
  | 'failed'

export const VOICE_ERROR_MESSAGES: Record<VoiceError, string> = {
  'not-allowed': 'Microphone blocked — allow mic access in your browser settings.',
  'no-speech': "Didn't catch that. Tap the mic and try again a bit louder.",
  network: 'Speech service unreachable — check your connection.',
  'not-available': 'Voice recognition is unavailable right now.',
  failed: 'Voice search failed. Please try again.',
}

/**
 * Day 21 — Voice search via the Web Speech API (Chrome/Edge/Safari).
 * Single-shot dictation: listen → live interim caption → final transcript.
 * Honest degradation: `supported` is false where the API doesn't exist,
 * and every failure surfaces a specific, actionable message.
 */
export function useVoiceSearch(options?: {
  locale?: string
  onFinal?: (text: string) => void
}) {
  const locale = options?.locale ?? 'en-US'
  const onFinalRef = useRef(options?.onFinal)
  useEffect(() => {
    onFinalRef.current = options?.onFinal
  }, [options?.onFinal])

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<VoiceError | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalTextRef = useRef('')

  // Client-only capability probe (SSR-safe: server snapshot = false).
  const noopSubscribe = useCallback(() => () => {}, [])
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false
  )

  // Abort any live recognition session on unmount (ref-only, no setState)
  useEffect(() => {
    return () => {
      recRef.current?.abort()
      recRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const start = useCallback(() => {
    // Capability is derived (no setter): when the constructor is missing the
    // mic button is hidden upstream, so a start() call here is a no-op.
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    // Fresh instance per session — reusing aborted instances is flaky.
    recRef.current?.abort()
    setError(null)
    setInterim('')
    finalTextRef.current = ''

    const rec = new Ctor()
    recRef.current = rec
    rec.lang = locale
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => setListening(true)

    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0]
        if (!alt) continue
        if (res.isFinal) {
          finalTextRef.current += alt.transcript
        } else {
          live += alt.transcript
        }
      }
      setInterim(live)
      if (finalTextRef.current.trim()) {
        // Single-shot: stop as soon as we have a final phrase.
        rec.stop()
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'aborted') return // user-cancelled, not an error
      if (
        e.error === 'not-allowed' ||
        e.error === 'service-not-allowed'
      ) {
        setError('not-allowed')
      } else if (e.error === 'no-speech') {
        setError('no-speech')
      } else if (e.error === 'network') {
        setError('network')
      } else if (e.error === 'language-not-supported' || e.error === 'language_not_supported') {
        setError('not-available')
      } else {
        setError('failed')
      }
      setListening(false)
    }

    rec.onend = () => {
      setListening(false)
      const text = finalTextRef.current.trim()
      if (text) {
        setInterim('')
        onFinalRef.current?.(text)
      }
    }

    try {
      rec.start()
    } catch {
      // start() throws if called while already running — safe to ignore
    }
  }, [locale])

  return { supported, listening, interim, error, start, stop, clearError }
}

/** Music-region → BCP-47 locale for voice input. */
export const VOICE_LOCALE_BY_REGION: Record<string, string> = {
  BD: 'bn-BD',
  IN: 'en-IN',
  US: 'en-US',
  GB: 'en-GB',
  DE: 'de-DE',
  JP: 'ja-JP',
}
