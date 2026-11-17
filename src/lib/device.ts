// Dhun — persistent, human-readable label for THIS device.
// Used to tag queue handoffs ("sent from <device>") so other devices can
// show a meaningful "Continue listening — sent from your Phone" prompt.

const KEY = 'dhun-device-label'

function defaultLabel(): string {
  if (typeof navigator === 'undefined') return 'This device'
  const ua = navigator.userAgent
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iPhone'
      : /Macintosh|Mac OS/i.test(ua)
        ? 'Mac'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Device'
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : ''
  return [browser, os].filter(Boolean).join(' on ') || os
}

/** Stable per-device label (localStorage-backed, UA-derived default). */
export function getDeviceLabel(): string {
  if (typeof window === 'undefined') return 'This device'
  try {
    const existing = window.localStorage.getItem(KEY)
    if (existing) return existing
    const label = defaultLabel()
    window.localStorage.setItem(KEY, label)
    return label
  } catch {
    return defaultLabel()
  }
}

export function setDeviceLabel(label: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, label.trim().slice(0, 60) || defaultLabel())
  } catch {}
}
