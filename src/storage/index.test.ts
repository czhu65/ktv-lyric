import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { loadSettings, saveSettings, SETTINGS_KEY, DEFAULT_SETTINGS, cacheSong, getCachedSong } from './index'
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
    saveSettings({ ...DEFAULT_SETTINGS, interLineGapSec: 2.5, romanization: 'yale' })
    expect(loadSettings().interLineGapSec).toBe(2.5)
    expect(loadSettings().romanization).toBe('yale')
  })

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores unknown fields and clamps out-of-range gaps', () => {
    saveSettings({ ...DEFAULT_SETTINGS, interLineGapSec: 999 })
    expect(loadSettings().interLineGapSec).toBeLessThanOrEqual(10)
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
})
