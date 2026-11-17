// Shared types for Dhun music platform — DO NOT MODIFY without coordinating both frontend & backend
export interface MusicItem {
  id: string // YouTube videoId
  title: string
  artist: string // channel / artist name
  artwork: string // thumbnail url
  duration: number // seconds
  views?: number
  album?: string
  year?: string
  genre?: string
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
}

export interface PlaylistDetail extends PlaylistSummary {
  items: PlaylistItemData[]
}

export interface LibraryTrack {
  id: string // internal row id
  trackId: string // youtube videoId
  title: string
  artist: string
  artwork: string | null
  duration: number
  addedAt?: string
  playedAt?: string
}

// localStorage-persisted queue item
export interface QueuedTrack extends MusicItem {
  queuedAt: number
}

export const SEARCH_FILTERS: SearchFilter[] = ['music_songs', 'videos', 'albums', 'artists', 'playlists']
