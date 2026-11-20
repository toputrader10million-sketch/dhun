'use client'
/* Dhun — Pro unlock mechanisms (Day 53).
 *
 * Dhun Pro is free-for-now: there is no payment anywhere. Three honest
 * ways to unlock:
 *   1. Instant   — one tap in the upsell sheet ("Activate Pro — free").
 *   2. Loyalty   — after real usage (25 tracks played across ≥3 days),
 *                  the app mints a personal unlock code the user can
 *                  paste any time. Generated offline, no server.
 *   3. Feedback  — sending structured feedback from the sheet thanks the
 *                  user with an unlock code.
 *   4. Code      — anyone can paste an unlock code; codes carry a
 *                  deterministic checksum so typos are caught offline.
 *
 * Code format: DHUN-XXXXX-XXXXX (A-Z0-9, ambiguous chars removed).
 * Checksum: djb2 hash of the 10 payload chars, base-32 suffix char.
 */
import { useSettings, type ProVia } from '@/store/settings'

/** Unambiguous alphabet (no I/L/O/0/1 confusion). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const PAYLOAD_LEN = 10
export const UNLOCK_CODE_PREFIX = 'DHUN'

/** djb2 — small, stable, deterministic. Not security; just typo-guarding. */
function djb2(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function checksumChar(payload: string): string {
  return ALPHABET[djb2(payload) % ALPHABET.length]
}

/** Build a full code from exactly 10 payload chars (throws on bad input). */
function encodeCode(payload: string): string {
  const clean = payload.toUpperCase()
  if (clean.length !== PAYLOAD_LEN || [...clean].some((c) => !ALPHABET.includes(c))) {
    throw new Error('bad payload')
  }
  const body = clean.slice(0, 5) + clean.slice(5)
  return `${UNLOCK_CODE_PREFIX}-${clean.slice(0, 5)}-${clean.slice(5)}${checksumChar(clean)}`
}

/** Persistent device seed — a random 10-char string created once. */
export function getDeviceSeed(): string {
  try {
    const KEY = 'dhun-device-seed'
    let seed = localStorage.getItem(KEY)
    if (!seed || seed.length !== PAYLOAD_LEN) {
      let out = ''
      const buf = new Uint8Array(PAYLOAD_LEN)
      crypto.getRandomValues(buf)
      for (let i = 0; i < PAYLOAD_LEN; i++) out += ALPHABET[buf[i] % ALPHABET.length]
      seed = out
      localStorage.setItem(KEY, out)
    }
    return seed
  } catch {
    return 'DHUNFALLBACK'
  }
}

/**
 * Loyalty code — deterministic per device: the same device always mints
 * the same code, so it can be re-copied later without any storage.
 */
export function mintLoyaltyCode(): string {
  const seed = getDeviceSeed()
  const payload = seed
    .split('')
    .map((c, i) => ALPHABET[(ALPHABET.indexOf(c) + i * 7 + djb2(seed)) % ALPHABET.length])
    .join('')
  return encodeCode(payload)
}

/**
 * Feedback code — stable per device but different from the loyalty one
 * (same seed, different derivation), so it stays copyable too.
 */
export function mintFeedbackCode(): string {
  const seed = getDeviceSeed()
  const payload = seed
    .split('')
    .map((c, i) => ALPHABET[(ALPHABET.indexOf(c) + i * 3 + djb2(seed + 'FB')) % ALPHABET.length])
    .join('')
  return encodeCode(payload)
}

export type UnlockCodeResult = { ok: true } | { ok: false; reason: 'format' | 'checksum' }

/** Verify a pasted unlock code offline (format + checksum). */
export function verifyUnlockCode(raw: string): UnlockCodeResult {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '')
  const m = code.match(/^DHUN-([A-Z2-9]{5})-([A-Z2-9]{6})$/)
  if (!m) return { ok: false, reason: 'format' }
  const payload = m[1] + m[2].slice(0, 5)
  if (checksumChar(payload) !== m[2][5]) return { ok: false, reason: 'checksum' }
  return { ok: true }
}

/**
 * Imperative activation for non-React callers (sheets, code verification).
 * React components should use `useSettings((s) => s.activatePro)` instead.
 */
export function activatePro(via: ProVia) {
  useSettings.getState().activatePro(via)
}

/** Record that feedback was sent (thanks unlock) — local, honest, no server. */
export function recordFeedbackSent(text: string) {
  try {
    const KEY = 'dhun-feedback-log'
    const log: Array<{ at: string; text: string }> = JSON.parse(localStorage.getItem(KEY) || '[]')
    log.unshift({ at: new Date().toISOString(), text: text.slice(0, 500) })
    localStorage.setItem(KEY, JSON.stringify(log.slice(0, 20)))
  } catch {
    /* private mode — feedback still thanks with a code */
  }
}
