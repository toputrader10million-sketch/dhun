import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { cacheGet, cacheSet } from '@/lib/piped'
import { withBreaker } from '@/lib/circuit-breaker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 20 * 60 * 1000

export interface WeatherInfo {
  /** Celsius */
  temp: number
  /** 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' */
  condition: string
  isDay: boolean
  /** Human label used by the UI ("Clear", "Light rain"…) */
  label: string
  /** Emoji glyph for the chip */
  glyph: string
}

/* Open-Meteo (free, no API key) → compact weather info for the smart home feed.
 * Coordinates come from the region→city map on the client (no geolocation
 * permission prompt needed). */
function describe(code: number): { condition: string; label: string; glyph: string } {
  if (code === 0) return { condition: 'clear', label: 'Clear', glyph: '☀️' }
  if (code <= 2) return { condition: 'cloudy', label: 'Partly cloudy', glyph: '🌤️' }
  if (code === 3) return { condition: 'cloudy', label: 'Overcast', glyph: '☁️' }
  if (code === 45 || code === 48) return { condition: 'fog', label: 'Fog', glyph: '🌫️' }
  if (code >= 51 && code <= 67) return { condition: 'rain', label: 'Rain', glyph: '🌧️' }
  if (code >= 71 && code <= 77) return { condition: 'snow', label: 'Snow', glyph: '🌨️' }
  if (code >= 80 && code <= 82) return { condition: 'rain', label: 'Showers', glyph: '🌦️' }
  if (code >= 85 && code <= 86) return { condition: 'snow', label: 'Snow showers', glyph: '🌨️' }
  if (code >= 95) return { condition: 'storm', label: 'Thunderstorm', glyph: '⛈️' }
  return { condition: 'cloudy', label: 'Cloudy', glyph: '☁️' }
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'))
  const lon = Number(req.nextUrl.searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return apiError('Invalid coordinates', { status: 400 })
  }

  // Bucket to 1° to keep the cache useful across users nearby
  const latKey = Math.round(lat)
  const lonKey = Math.round(lon)
  const cacheKey = `weather:${latKey}:${lonKey}`
  const cached = cacheGet<WeatherInfo>(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,is_day&timezone=auto`
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await withBreaker('openmeteo', async () => {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      if (!r.ok) throw new Error(`open-meteo ${r.status}`)
      return (await r.json()) as {
        current?: { temperature_2m?: number; weather_code?: number; is_day?: number }
      }
    })
    clearTimeout(t)
    const cur = res.current ?? {}
    const desc = describe(cur.weather_code ?? 0)
    const out: WeatherInfo = {
      temp: Math.round(cur.temperature_2m ?? 0),
      condition: desc.condition,
      label: desc.label,
      glyph: desc.glyph,
      isDay: cur.is_day !== 0,
    }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Weather unavailable', {
      status: 502,
    })
  }
}
