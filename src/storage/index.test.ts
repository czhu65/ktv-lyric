import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  loadSettings, saveSettings, SETTINGS_KEY, DEFAULT_SETTINGS,
  cacheSong, getCachedSong, getCachedSongByTitleArtist,
} from './index'
import type { Song } from '../types'

describe('settings', () => {
  beforeEach(() => localStorage.clear())

  it('uses a namespaced key — the whole github.io origin is shared', () => {
    expect(SETTINGS_KEY).toBe('ktvlyric:settings')
  })

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips saved settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, interLineGapSec: 2.5, romanization: { yue: 'yale', cmn: 'tonemark' } })
    expect(loadSettings().interLineGapSec).toBe(2.5)
    expect(loadSettings().romanization).toEqual({ yue: 'yale', cmn: 'tonemark' })
  })

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores unknown fields and clamps out-of-range gaps to the slider\'s own max', () => {
    // SettingsPanel.tsx's <input type="range"> caps at max={5} -- storage's
    // clamp must agree, or a value the UI can never produce (or dial back
    // down from) could still land in localStorage.
    saveSettings({ ...DEFAULT_SETTINGS, interLineGapSec: 999 })
    expect(loadSettings().interLineGapSec).toBeLessThanOrEqual(5)
  })
})

describe('romanization settings migration', () => {
  it('defaults to Jyutping and tone marks', () => {
    localStorage.clear()
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })

  it('migrates a legacy flat string, preserving the choice', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ romanization: 'yale' }))
    expect(loadSettings().romanization).toEqual({ yue: 'yale', cmn: 'tonemark' })
  })

  it('migrates a legacy jyutping string', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ romanization: 'jyutping' }))
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })

  it('reads the new shape back unchanged', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      romanization: { yue: 'yale', cmn: 'tonenum' },
    }))
    expect(loadSettings().romanization).toEqual({ yue: 'yale', cmn: 'tonenum' })
  })

  it('falls back per-language on an unrecognised style id', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      romanization: { yue: 'bogus', cmn: 'bogus' },
    }))
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })

  it('survives a completely malformed value', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ romanization: 42 }))
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })
})

// jsdom (the vitest environment for this project) does not implement
// IndexedDB, so we polyfill it with fake-indexeddb for these tests. A fresh
// IDBFactory is installed before each test so writes from one test can never
// leak into the next.
describe('song cache', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  const song: Song = {
    title: 'Test Title',
    artist: 'Test Artist',
    lines: [{ tokens: [{ chars: [{ char: '我', syllables: ['ngo5'] }] }], timeMs: 1000 }],
    source: 'lrclib',
    lrclibId: 42,
  }

  it('round-trips a cached song', async () => {
    await cacheSong(song)
    expect(await getCachedSong(42)).toEqual(song)
  })

  it('is a no-op for a song with no lrclibId', async () => {
    const noId: Song = { ...song, lrclibId: undefined }
    await expect(cacheSong(noId)).resolves.toBeUndefined()
    // Nothing was written under any key we can check — the DB should still
    // be empty for the id the song otherwise would have used.
    expect(await getCachedSong(42)).toBeNull()
  })

  it('returns null for a key that was never written', async () => {
    expect(await getCachedSong(999)).toBeNull()
  })

  it('overwrites on a second write to the same key', async () => {
    await cacheSong(song)
    const updated: Song = { ...song, title: 'Updated Title' }
    await cacheSong(updated)
    expect(await getCachedSong(42)).toEqual(updated)
  })

  // --- Finding 4: a picked SongCandidate never carries lrclibId (only
  // title/artist), so a repeat pick needs a way to find the cached song
  // WITHOUT already knowing its id -- that's what this index is for. ---

  describe('getCachedSongByTitleArtist', () => {
    it('finds a cached song by title and artist, without needing its lrclibId', async () => {
      await cacheSong(song)
      expect(await getCachedSongByTitleArtist(song.title, song.artist)).toEqual(song)
    })

    it('returns null when no cached song matches the title/artist pair', async () => {
      await cacheSong(song)
      expect(await getCachedSongByTitleArtist('Nope', 'Nobody')).toBeNull()
      expect(await getCachedSongByTitleArtist(song.title, 'Wrong Artist')).toBeNull()
    })

    it('returns null against an empty cache', async () => {
      expect(await getCachedSongByTitleArtist(song.title, song.artist)).toBeNull()
    })
  })
})
