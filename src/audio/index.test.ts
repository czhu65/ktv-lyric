import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAudioEngine } from './index'

function fakeCtx() {
  return {
    currentTime: 0,
    state: 'suspended' as AudioContextState,
    destination: {} as AudioDestinationNode,
    resume: vi.fn(async function (this: { state: string }) { this.state = 'running' }),
    decodeAudioData: vi.fn(async () => ({ duration: 0.42 }) as AudioBuffer),
    createBufferSource: vi.fn(() => ({
      buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    })),
  }
}

describe('AudioEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('syllables.json')
        ? new Response(JSON.stringify(['coeng3', 'go1']))
        : new Response(new ArrayBuffer(8))))
  })

  it('resumes a suspended context on unlock', async () => {
    const ctx = fakeCtx()
    const e = createAudioEngine(ctx as unknown as BaseAudioContext)
    await e.unlock()
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('reports which syllables exist without a network round trip', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await e.unlock()
    expect(e.has('coeng3')).toBe(true)
    expect(e.has('zzz9')).toBe(false)
  })

  it('fetches and decodes a syllable once, then caches it', async () => {
    const ctx = fakeCtx()
    const e = createAudioEngine(ctx as unknown as BaseAudioContext)
    await e.unlock()
    await e.load('coeng3')
    await e.load('coeng3')
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('returns null for a syllable with no audio instead of throwing', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await e.unlock()
    expect(await e.load('zzz9')).toBeNull()
  })

  it('play returns the clip duration for the scheduler', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await e.unlock()
    await e.load('coeng3')
    expect(e.play('coeng3', 0)).toBeCloseTo(0.42)
  })

  it('duration reports a loaded clip length without playing it', async () => {
    const ctx = fakeCtx()
    const e = createAudioEngine(ctx as unknown as BaseAudioContext)
    await e.unlock()
    await e.load('coeng3')
    expect(e.duration('coeng3')).toBeCloseTo(0.42)
    expect(ctx.createBufferSource).not.toHaveBeenCalled()
  })

  it('duration returns 0 for a clip that is not loaded', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await e.unlock()
    expect(e.duration('go1')).toBe(0)
  })
})
