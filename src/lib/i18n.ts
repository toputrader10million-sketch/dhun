'use client'
/* Dhun — i18n engine (Days 43-44).
 *
 * Lightweight, dependency-free translation layer:
 *  - English is the source language: the translation KEY is the exact English
 *    UI string (with optional {0},{1} placeholders). Missing Bangla entries
 *    fall back to the key itself → English. No key can ever render blank.
 *  - `language` lives in the settings store (persisted, instant re-render via
 *    the zustand selector in useT).
 *  - `document.documentElement.lang` is synced in AppShell for a11y.
 *
 * Dictionary lives in src/lib/i18n-bn.ts (keyed by the English source string).
 */
import { useCallback } from 'react'
import { useSettings } from '@/store/settings'
import { BN } from '@/lib/i18n-bn'

export type Language = 'en' | 'bn'

export const LANGUAGES: Array<{ id: Language; native: string; label: string }> = [
  { id: 'en', native: 'English', label: 'English' },
  { id: 'bn', native: 'বাংলা', label: 'Bangla' },
]

/** Format "Track {0} of {1}" style templates. */
export function formatTemplate(template: string, args?: Array<string | number>): string {
  if (!args || args.length === 0) return template
  return template.replace(/\{(\d+)\}/g, (m, i) => {
    const v = args[Number(i)]
    return v === undefined ? m : String(v)
  })
}

export type TFn = (key: string, args?: Array<string | number>) => string

/** Translate an English source string into the active language. */
export function translate(lang: Language, key: string, args?: Array<string | number>): string {
  let out = key
  if (lang === 'bn') {
    const hit = (BN as Record<string, string | undefined>)[key]
    if (typeof hit === 'string' && hit.length > 0) out = hit
  }
  return formatTemplate(out, args)
}

/** Reactive translator — re-renders every subscribed component on switch. */
export function useT(): TFn {
  const lang = useSettings((s) => s.language)
  return useCallback<TFn>((key, args) => translate(lang, key, args), [lang])
}
