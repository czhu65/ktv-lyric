import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  loadSettings, saveSettings, SETTINGS_KEY, DEFAULT_SETTINGS,
  cacheLyric, getCachedLyric, getCachedLyricByTitleArtist,
} from './index'

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
// leak into the next. A fresh factory also means each test opens a brand new
// 'ktv-lyric-v2' database, so there is no state to explicitly tear down.
describe('lyric cache', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  it('round-trips a record by id', async () => {
    await cacheLyric({
      lrclibId: 1, title: '天空', artist: '歌手',
      raw: [{ text: '天空', timeMs: 0 }], langGuess: 'yue',
    })
    const got = await getCachedLyric(1)
    expect(got?.raw).toEqual([{ text: '天空', timeMs: 0 }])
    expect(got?.langGuess).toBe('yue')
  })

  it('round-trips by title and artist', async () => {
    await cacheLyric({ lrclibId: 2, title: '天空', artist: '歌手', raw: [{ text: '天空' }] })
    const got = await getCachedLyricByTitleArtist('天空', '歌手')
    expect(got?.lrclibId).toBe(2)
  })

  it('stores raw text only, never annotations', async () => {
    await cacheLyric({ lrclibId: 3, title: '你好', artist: '歌手', raw: [{ text: '你好' }] })
    const got = await getCachedLyric(3)
    // The whole point: nothing language-specific is persisted, so the same
    // record serves both packs and toggling needs no second entry.
    expect(JSON.stringify(got)).not.toContain('syllables')
    expect(JSON.stringify(got)).not.toContain('tokens')
  })

  it('returns null for an unknown id', async () => {
    expect(await getCachedLyric(9999)).toBeNull()
  })
})
