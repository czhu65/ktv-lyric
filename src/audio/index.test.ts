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

  // --- Finding 2: has() must not report false merely because the manifest
  // hasn't loaded yet -- "unknown" must read as available, not absent. ---

  it('has() reports true for everything before the manifest has loaded', () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    // No unlock()/preloadManifest() call -- the manifest is still null.
    expect(e.has('coeng3')).toBe(true)
    expect(e.has('anything-at-all')).toBe(true)
  })

  it('has() settles to the real manifest membership once it resolves', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    expect(e.has('zzz9')).toBe(true) // unknown -- assumed available
    await e.unlock()
    expect(e.has('zzz9')).toBe(false) // now known -- genuinely absent
    expect(e.has('coeng3')).toBe(true) // now known -- genuinely present
  })

  it('preloadManifest() loads the manifest without touching AudioContext.resume()', async () => {
    const ctx = fakeCtx()
    const e = createAudioEngine(ctx as unknown as BaseAudioContext)
    await e.preloadManifest()
    expect(ctx.resume).not.toHaveBeenCalled()
    expect(e.has('coeng3')).toBe(true)
    expect(e.has('zzz9')).toBe(false)
  })

  // --- Finding 3: a manifest fetch that is genuinely not-ok must be treated
  // as a failure -- not silently `.json()`-parsed into garbage -- and must
  // not be memoised, so a later retry can still succeed. Mirrors
  // src/dict/index.ts's loadDict() handling of the identical failure mode.
  // Uses 500, not 404: since the Task 16 amendment, 404 has its own
  // deliberate "no bank yet" meaning and must NOT reject -- see below. ---

  it('unlock() rejects when the manifest fetch is not ok, instead of silently parsing an error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await expect(e.unlock()).rejects.toThrow(/500/)
  })

  // --- Task 16 amendment: a missing manifest (404) means "this bank simply
  // doesn't exist yet" (e.g. Mandarin before its audio bank is built), not
  // "the network failed". It must degrade quietly -- resolve, not reject --
  // with has() settling to false for every syllable so the per-character
  // "no audio" marker takes over instead of an error notice. Any other
  // failure (500, etc.) must keep rejecting exactly as before. ---

  it('unlock() resolves (does not reject) when the manifest 404s, treating it as "no bank yet"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not found</html>', { status: 404 })))
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await expect(e.unlock()).resolves.toBeUndefined()
  })

  it('has() is false for every syllable once a 404 manifest has resolved -- an empty Set, not "unknown"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    expect(e.has('anything')).toBe(true) // still unknown before unlock() settles
    await e.unlock()
    expect(e.has('anything')).toBe(false) // now known: empty, not null
    expect(e.has('coeng3')).toBe(false)
  })

  it('unlock() still rejects on a genuine failure (500), not just resolving quietly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await expect(e.unlock()).rejects.toThrow(/500/)
  })

  it('retries after a failed manifest load, succeeding on the second call', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('server error', { status: 500 }))
        .mockImplementationOnce(async () => new Response(JSON.stringify(['coeng3', 'go1']))),
    )
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)

    await expect(e.unlock()).rejects.toThrow()
    await e.unlock()
    expect(e.has('coeng3')).toBe(true)
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

  it('fetches the manifest from the exact BASE_URL-relative path', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await e.unlock()
    expect(fetch).toHaveBeenCalledWith('/ktv-lyric/data/syllables.json')
  })

  it('fetches a clip from the exact BASE_URL-relative path', async () => {
    const e = createAudioEngine(fakeCtx() as unknown as BaseAudioContext)
    await e.unlock()
    await e.load('coeng3')
    expect(fetch).toHaveBeenCalledWith('/ktv-lyric/audio/syl/coeng3.mp3')
  })

  describe('LRU eviction', () => {
    // These don't call unlock(), so `available` stays null and load() skips
    // the manifest gate — every syllable name is treated as loadable. That
    // isolates the cache mechanics under test from the (unrelated) manifest
    // gate, and lets the fake syllable names be arbitrary.

    it('evicts once the bound is exceeded, and the cache never holds more than the bound', async () => {
      const ctx = fakeCtx()
      const e = createAudioEngine(ctx as unknown as BaseAudioContext, { lruMax: 3 })
      await e.load('s1')
      await e.load('s2')
      await e.load('s3')
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(3)

      await e.load('s4') // exceeds the bound by one -> evicts the oldest, s1
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4)

      // s2, s3, s4 must still be the exact 3 entries retained (a bound that
      // was exceeded, or eviction that removed the wrong entries, would show
      // up here as an unexpected re-decode). Checked before touching s1
      // again, since a cache hit itself refreshes recency and would
      // otherwise perturb this read-only check.
      await e.load('s2')
      await e.load('s3')
      await e.load('s4')
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4)

      await e.load('s1') // evicted -> must re-fetch and re-decode
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(5)
    })

    it('a syllable used via load() since insertion survives an eviction that removes an older, unused one', async () => {
      const ctx = fakeCtx()
      const e = createAudioEngine(ctx as unknown as BaseAudioContext, { lruMax: 3 })
      await e.load('s1')
      await e.load('s2')
      await e.load('s3')
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(3)

      await e.load('s1') // cache hit -> must refresh s1's recency
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(3) // still a hit, no re-decode

      await e.load('s4') // forces one eviction: s2 is now the oldest untouched entry
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4)

      await e.load('s1') // recently used -> must survive
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4)

      await e.load('s2') // never re-used -> must have been evicted instead
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(5)
    })

    it('play() counts as a use for recency purposes', async () => {
      const ctx = fakeCtx()
      const e = createAudioEngine(ctx as unknown as BaseAudioContext, { lruMax: 3 })
      await e.load('s1')
      await e.load('s2')
      await e.load('s3')
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(3)

      e.play('s1', 0) // must refresh s1's recency without re-decoding

      await e.load('s4') // forces one eviction: s2 is now the oldest untouched entry
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4)

      await e.load('s1') // played recently -> must survive
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4)

      await e.load('s2') // never touched -> must have been evicted instead
      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(5)
    })
  })

  describe('playSequence', () => {
    it('schedules two syllables at increasing times separated by the first clip\'s duration', async () => {
      const ctx = fakeCtx()
      const e = createAudioEngine(ctx as unknown as BaseAudioContext)
      await e.unlock()
      await e.load('coeng3')
      await e.load('go1')

      e.playSequence(['coeng3', 'go1'])

      expect(ctx.createBufferSource).toHaveBeenCalledTimes(2)
      const starts = ctx.createBufferSource.mock.results.map(
        (r) => (r.value as { start: ReturnType<typeof vi.fn> }).start.mock.calls[0][0] as number,
      )
      expect(starts[1] - starts[0]).toBeCloseTo(0.42, 5) // duration() of the first clip, from fakeCtx
    })

    it('skips a syllable with no loaded audio, without throwing, and does not advance the clock for it', async () => {
      const ctx = fakeCtx()
      const e = createAudioEngine(ctx as unknown as BaseAudioContext)
      await e.unlock()
      await e.load('coeng3')
      // 'go1' deliberately never loaded -- no decoded buffer for it.

      expect(() => e.playSequence(['coeng3', 'go1'])).not.toThrow()
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1)
    })

    it('a single syllable behaves as before: one clip scheduled at the current time', async () => {
      const ctx = fakeCtx()
      const e = createAudioEngine(ctx as unknown as BaseAudioContext)
      await e.unlock()
      await e.load('coeng3')

      e.playSequence(['coeng3'])

      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1)
      const start = (ctx.createBufferSource.mock.results[0].value as { start: ReturnType<typeof vi.fn> })
        .start.mock.calls[0][0] as number
      expect(start).toBeCloseTo(ctx.currentTime, 5)
    })
  })

  it('prefetch loads every distinct syllable, dedupes repeats, and tolerates ones with no audio', async () => {
    const ctx = fakeCtx()
    const e = createAudioEngine(ctx as unknown as BaseAudioContext)
    await e.unlock()

    await expect(
      e.prefetch(['coeng3', 'go1', 'coeng3', 'zzz9']),
    ).resolves.toBeUndefined()

    // coeng3 + go1 decoded once each; the repeated coeng3 is deduped within
    // the call, and zzz9 (absent from the manifest) never hits the network.
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(e.duration('coeng3')).toBeCloseTo(0.42)
    expect(e.duration('go1')).toBeCloseTo(0.42)
    expect(await e.load('zzz9')).toBeNull()
  })

  describe('createAudioEngine directory and manifest options', () => {
    it('defaults to the Cantonese bank', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ['ngo5'] })
      vi.stubGlobal('fetch', fetchMock)

      const engine = createAudioEngine(new AudioContext())
      await engine.preloadManifest()

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('data/syllables.json'))
    })

    it('fetches the manifest named in options', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ['wo3'] })
      vi.stubGlobal('fetch', fetchMock)

      const engine = createAudioEngine(new AudioContext(), {
        dir: 'audio/pin',
        manifest: 'data/pinyin.json',
      })
      await engine.preloadManifest()

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('data/pinyin.json'))
      expect(engine.has('wo3')).toBe(true)
    })

    it('loads clips from the directory named in options', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) =>
        url.includes('.json')
          ? Promise.resolve({ ok: true, json: async () => ['wo3'] })
          : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const ctx = new AudioContext()
      const engine = createAudioEngine(ctx, { dir: 'audio/pin', manifest: 'data/pinyin.json' })
      await engine.preloadManifest()
      await engine.load('wo3')

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('audio/pin/wo3.mp3'))
    })
  })
})
