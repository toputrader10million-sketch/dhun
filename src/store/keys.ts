'use client'
/* Dhun — Bring-Your-Own-Key store for user-supplied free API credentials.
 *
 * Jamendo (https://devportal.jamendo.com) hands out free non-commercial
 * client IDs; their catalog is Creative Commons and full-track downloadable
 * (legal offline music). The key lives ONLY in this user's localStorage and
 * travels as a query/header param to our own proxy routes — never stored
 * server-side.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface KeysState {
  jamendoKey: string
  setJamendoKey: (key: string) => void
}

export const useKeys = create<KeysState>()(
  persist(
    (set) => ({
      jamendoKey: '',
      setJamendoKey: (jamendoKey) => set({ jamendoKey: jamendoKey.trim() }),
    }),
    { name: 'dhun-keys' }
  )
)
