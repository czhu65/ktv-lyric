import type { SourceLine } from '../lyrics/parse'
import type { LangId } from '../types'

// Every key is namespaced: all of username.github.io/* shares ONE browser
// origin, so a bare `settings` key would collide with other Pages projects.
export const SETTINGS_KEY = 'ktvlyric:settings'

// v2: the store now holds RAW lyric lines instead of an annotated Song.
// Annotation depends on the active language pack, so caching it would make
// every cached syllable wrong the moment the user flips the toggle. Raw text
// is language-independent, smaller, and makes toggling a pure recompute.
//
// The name is bumped rather than the version because the contents are
// incompatible and this is PURELY a cache -- there is nothing to migrate, and
// a fresh database is cheaper and less error-prone than an upgrade path.
const DB_NAME = 'ktv-lyric-v2'
const STORE = 'lyrics'

export type Theme = 'system' | 'light' | 'dark'

export interface RomanizationChoice {
  /** A RomanizationStyle id from the Cantonese pack: 'jyutping' | 'yale' */
  yue: string
  /** A RomanizationStyle id from the Mandarin pack: 'tonemark' | 'tonenum' */
  cmn: string
}

export interface Settings {
  interLineGapSec: number
  romanization: RomanizationChoice
  rubyPosition: 'over' | 'under'
  theme: Theme
}

const YUE_STYLES = ['jyutping', 'yale']
const CMN_STYLES = ['tonemark', 'tonenum']

export const DEFAULT_SETTINGS: Settings = {
  interLineGapSec: 1.0,
  romanization: { yue: 'jyutping', cmn: 'tonemark' },
  rubyPosition: 'over',
  // 'system' rather than 'light': a study tool gets used late at night, and
  // following the OS is the least surprising default.
  theme: 'system',
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Accepts three shapes and always yields a valid choice:
 *   - the CURRENT object form
 *   - the LEGACY flat string ('jyutping' | 'yale'), written by every release
 *     before Mandarin support -- migrated, never discarded, so a user who
 *     picked Yale keeps Yale
 *   - anything else -> defaults
 */
function readRomanization(raw: unknown): RomanizationChoice {
  const d = DEFAULT_SETTINGS.romanization

  if (typeof raw === 'string') {
    return { yue: YUE_STYLES.includes(raw) ? raw : d.yue, cmn: d.cmn }
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const r = raw as Partial<RomanizationChoice>
    return {
      yue: typeof r.yue === 'string' && YUE_STYLES.includes(r.yue) ? r.yue : d.yue,
      cmn: typeof r.cmn === 'string' && CMN_STYLES.includes(r.cmn) ? r.cmn : d.cmn,
    }
  }
  return d
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return DEFAULT_SETTINGS
    }
    const p = parsed as Record<string, unknown>
    const gap = Number(p.interLineGapSec ?? DEFAULT_SETTINGS.interLineGapSec)
    return {
      // Clamped to match the settings slider's own max (SettingsPanel.tsx
      // caps the <input type="range"> at 5s) -- the two must agree, or a
      // hand-edited/legacy localStorage value could hold a gap the UI can
      // never reproduce or let the user dial back down to from the slider.
      interLineGapSec: clamp(Number.isFinite(gap) ? gap : DEFAULT_SETTINGS.interLineGapSec, 0, 5),
      romanization: readRomanization(p.romanization),
      rubyPosition: p.rubyPosition === 'under' ? 'under' : 'over',
      theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
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
// lets a repeat pick skip the network entirely (see getCachedLyricByTitleArtist).
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

export interface CachedLyric {
  lrclibId: number
  title: string
  artist: string
  /** Exactly what fetchLyrics() returned. Never annotated. */
  raw: SourceLine[]
  /** Carried through so a cache hit still seeds the language toggle without
   *  a second search. */
  langGuess?: LangId
}

export async function cacheLyric(rec: CachedLyric): Promise<void> {
  if (!rec.lrclibId) return
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rec)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedLyric(id: number): Promise<CachedLyric | null> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as CachedLyric) ?? null)
    req.onerror = () => reject(req.error)
  })
}

// Looked up by title+artist rather than lrclibId -- a picked SongCandidate
// only ever carries title/artist/album/durationSec (never an id, which is
// assigned by LRCLIB and only learned from the fetch this function exists to
// skip). Pasted lyrics are never written here (no lrclibId, see cacheLyric).
export async function getCachedLyricByTitleArtist(
  title: string, artist: string,
): Promise<CachedLyric | null> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE)
      .index(TITLE_ARTIST_INDEX).get([title, artist])
    req.onsuccess = () => resolve((req.result as CachedLyric) ?? null)
    req.onerror = () => reject(req.error)
  })
}
