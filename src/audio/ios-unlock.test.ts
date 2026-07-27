import { describe, it, expect, vi } from 'vitest'
import { unlockIosAudioSession, SILENT_WAV_DATA_URI } from './ios-unlock'

describe('unlockIosAudioSession', () => {
  it('sets navigator.audioSession.type to playback when the API exists', () => {
    const audioSession = { type: 'ambient' }
    const createAudio = vi.fn(() => ({ play: () => Promise.resolve() }))

    unlockIosAudioSession({ audioSession, createAudio })

    expect(audioSession.type).toBe('playback')
  })

  it('does nothing to audioSession when the API is absent (feature detection)', () => {
    const createAudio = vi.fn(() => ({ play: () => Promise.resolve() }))

    expect(() => unlockIosAudioSession({ createAudio })).not.toThrow()
  })

  it('plays the silent WAV', () => {
    const createAudio = vi.fn(() => ({ play: () => Promise.resolve() }))

    unlockIosAudioSession({ createAudio })

    expect(createAudio).toHaveBeenCalledWith(SILENT_WAV_DATA_URI)
    expect(createAudio).toHaveBeenCalledTimes(1)
  })

  it('does not throw or leave an unhandled rejection when play() rejects', async () => {
    const createAudio = () => ({ play: () => Promise.reject(new Error('autoplay blocked')) })

    expect(() => unlockIosAudioSession({ createAudio })).not.toThrow()
    // Let the rejected promise's internal .catch() actually run before the
    // test ends, or vitest can report it as an unhandled rejection anyway.
    await new Promise((r) => setTimeout(r, 0))
  })

  // --- HTMLMediaElement.play() is SPEC'D to return a Promise, but not every
  // environment honours that -- jsdom's returns plain `undefined`, which is
  // exactly how this bug was actually found: calling .catch() directly on
  // it threw synchronously, and since unlock() is on the critical path to
  // every tap, that throw aborted playback entirely instead of merely
  // failing to unlock the iOS mute workaround. These two cases are what
  // that fix depends on staying correct. ---

  it('does not throw when play() returns a non-Promise value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createAudio = () => ({ play: () => undefined as any })

    expect(() => unlockIosAudioSession({ createAudio })).not.toThrow()
  })

  it('does not throw when play() itself throws synchronously', () => {
    const createAudio = () => ({
      play: () => { throw new Error('play() rejected synchronously') },
    })

    expect(() => unlockIosAudioSession({ createAudio })).not.toThrow()
  })
})
