import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// jsdom implements no IndexedDB at all, and (since Finding 4) App.tsx now
// reads it unconditionally on every pick via getCachedSongByTitleArtist --
// so every test that can render <App /> or exercise storage/index.ts needs
// SOMETHING under this name, not just the handful of tests that used to
// polyfill it themselves. A fresh IDBFactory before each test keeps one
// test's cached-song writes from leaking into an unrelated test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

// jsdom implements no Web Audio API at all. App.tsx constructs a real
// AudioContext at mount time (before any user gesture -- only .resume() is
// gesture-gated, per Finding 6), so component tests that render <App />
// need SOMETHING under this name or the very first render throws
// ReferenceError. This stub exists purely so construction succeeds; it is
// never asserted against directly -- tests that need real assertions on
// context behaviour (resume() being called, decodeAudioData, etc.) already
// bring their own richer fakeCtx() and pass it to createAudioEngine/
// createPlayer directly, bypassing the global entirely.
if (typeof globalThis.AudioContext === 'undefined') {
  class FakeAudioContext {
    state: AudioContextState = 'suspended'
    currentTime = 0
    destination = {} as AudioDestinationNode
    resume = async () => { this.state = 'running' }
    decodeAudioData = async () => ({ duration: 0 }) as AudioBuffer
    createBufferSource = () => ({
      buffer: null, connect: () => {}, start: () => {}, stop: () => {},
    })
  }
  // @ts-expect-error -- jsdom provides no real AudioContext to satisfy this against
  globalThis.AudioContext = FakeAudioContext
}
