// Shared types for Dhun music platform — DO NOT MODIFY without coordinating both frontend & backend
export type TrackSource = 'yt' | 'au' | 'jm' // yt = YouTube (Piped/embed), au = Audius, jm = Jamendo (CC)

export interface MusicItem {
  id: string // YouTube videoId (source='yt') or Audius track id (source='au')
  title: string
  artist: string // channel / artist name
  artwork: string // thumbnail url
  duration: number // seconds
  views?: number
  album?: string
  year?: string
  genre?: string
  source?: TrackSource // absent = legacy 'yt'
  /** Audius: known-streamability flag (absent = unknown). Dead tracks excluded by Smart Match. */
  streamable?: boolean
}

export type SearchFilter = 'music_songs' | 'videos' | 'albums' | 'artists' | 'playlists'

export interface SearchResponse {
  items: MusicItem[]
  nextPage?: string
  filter: SearchFilter
}

export interface HomeSection {
  title: string
  items: MusicItem[]
}

export interface HomeResponse {
  sections: HomeSection[]
}

export interface LyricsResponse {
  synced?: string // LRC format
  plain?: string
  source: string
}

export interface ArtworkResponse {
  url: string | null
  album?: string
  genre?: string
  year?: string
}

export interface InstanceStatus {
  name: string
  url: string
  ok: boolean
  latencyMs: number
}

// Health-dashboard payload from GET /api/instances (includes history)
export interface InstanceHealthSample {
  t: number
  ok: boolean
  ms: number | null
}

export interface InstanceHealth {
  name: string
  url: string
  ok: boolean
  latencyMs: number
  avgLatencyMs: number
  uptimePct: number
  checks: number
  history: InstanceHealthSample[]
  preferred: boolean
}

export interface InstanceHealthResponse {
  checkedAt: string
  preferred: string
  instances: InstanceHealth[]
}

export interface AudioStream {
  url: string
  bitrate: number
  mimeType: string
  quality: string
  codec?: string
}

export interface PlaylistSummary {
  id: string
  name: string
  description: string | null
  cover: string | null
  count: number
  createdAt: string
}

export interface PlaylistItemData {
  id: string
  trackId: string
  title: string
  artist: string
  artwork: string | null
  duration: number
  position: number
  source?: TrackSource // absent = legacy 'yt'
}

export interface PlaylistDetail extends PlaylistSummary {
  items: PlaylistItemData[]
}

export interface LibraryTrack {
  id: string // internal row id
  trackId: string // youtube videoId (or Audius track id)
  title: string
  artist: string
  artwork: string | null
  duration: number
  addedAt?: string
  playedAt?: string
  source?: TrackSource // absent = legacy 'yt'
}

// localStorage-persisted queue item
export interface QueuedTrack extends MusicItem {
  queuedAt: number
}

export const SEARCH_FILTERS: SearchFilter[] = ['music_songs', 'videos', 'albums', 'artists', 'playlists']
