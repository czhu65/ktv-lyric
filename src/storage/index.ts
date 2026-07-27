import type { Song } from '../types'

// Every key is namespaced: all of username.github.io/* shares ONE browser
// origin, so a bare `settings` key would collide with other Pages projects.
export const SETTINGS_KEY = 'ktvlyric:settings'
const DB_NAME = 'ktv-lyric-v1'
const STORE = 'songs'

export interface Settings {
  interLineGapSec: number
  romanization: 'jyutping' | 'yale'
  rubyPosition: 'over' | 'under'
}

export const DEFAULT_SETTINGS: Settings = {
  interLineGapSec: 1.0,
  romanization: 'jyutping',
  rubyPosition: 'over',
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return DEFAULT_SETTINGS
    }
    const p = parsed as Partial<Settings>
    const gap = Number(p.interLineGapSec ?? DEFAULT_SETTINGS.interLineGapSec)
    return {
      // Clamped to match the settings slider's own max (SettingsPanel.tsx
      // caps the <input type="range"> at 5s) -- the two must agree, or a
      // hand-edited/legacy localStorage value could hold a gap the UI can
      // never reproduce or let the user dial back down to from the slider.
      interLineGapSec: clamp(Number.isFinite(gap) ? gap : DEFAULT_SETTINGS.interLineGapSec, 0, 5),
      romanization: p.romanization === 'yale' ? 'yale' : 'jyutping',
      rubyPosition: p.rubyPosition === 'under' ? 'under' : 'over',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// Kept as its own index (not the primary key) so a song can be looked up by
// title+artist -- the only thing known about a SongCandidate BEFORE the
// LRCLIB fetch that would otherwise be needed to learn its id. That is what
// lets a repeat pick skip the network entirely (see getCachedSongByTitleArtist).
const TITLE_ARTIST_INDEX = 'byTitleArtist'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'lrclibId' })
      store.createIndex(TITLE_ARTIST_INDEX, ['title', 'artist'])
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function cacheSong(song: Song): Promise<void> {
  if (!song.lrclibId) return
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(song)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedSong(id: number): Promise<Song | null> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Song) ?? null)
    req.onerror = () => reject(req.error)
  })
}

// Looked up by title+artist rather than lrclibId -- a picked SongCandidate
// only ever carries title/artist/album/durationSec (never an id, which is
// assigned by LRCLIB and only learned from the fetch this function exists
// to skip). Pasted songs are never written here (no lrclibId, see cacheSong),
// so this can only ever match a song that came from a previous LRCLIB pick.
export async function getCachedSongByTitleArtist(title: string, artist: string): Promise<Song | null> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).index(TITLE_ARTIST_INDEX).get([title, artist])
    req.onsuccess = () => resolve((req.result as Song) ?? null)
    req.onerror = () => reject(req.error)
  })
}
