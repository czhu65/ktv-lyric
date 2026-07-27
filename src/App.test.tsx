import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { createDict, type Dict } from './dict'

// Both modules are mocked so individual tests can control exactly when
// network calls resolve (and in what order) -- `importOriginal` keeps every
// other export (notably the real `RateLimitError` class and `createDict`)
// so `instanceof` checks inside App.tsx still work against the same class
// reference the tests construct errors with.
vi.mock('./search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./search')>()
  return { ...actual, searchSongs: vi.fn(), fetchLyrics: vi.fn() }
})
vi.mock('./dict', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dict')>()
  return { ...actual, loadDict: vi.fn() }
})

import { searchSongs, fetchLyrics, RateLimitError } from './search'
import { loadDict } from './dict'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('App', () => {
  beforeEach(() => {
    vi.mocked(searchSongs).mockReset()
    vi.mocked(fetchLyrics).mockReset()
    // Default: dictionary is available immediately. Tests exercising the
    // still-loading case override this before rendering.
    vi.mocked(loadDict).mockReset().mockResolvedValue(createDict({}))
  })

  it('renders the search box on first load', () => {
    render(<App />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('always offers the paste fallback — LRCLIB misses 20-40% of modern HK songs', () => {
    render(<App />)
    // A native <details>/<summary> disclosure, so it is queried by its text
    // rather than a button role. What matters is that it is present on first
    // load, with no failed search required to reveal it.
    const summary = screen.getByText(/paste lyrics manually/i)
    expect(summary).toBeInTheDocument()
    expect(summary.closest('details')).not.toBeNull()
  })

  // --- Finding 1 / Finding 5: search-path rate limiting ---

  it('names the retry delay when search itself is rate limited, not a generic message', async () => {
    vi.mocked(searchSongs).mockRejectedValue(new RateLimitError(42))
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox'), '你好')
    await waitFor(() => expect(searchSongs).toHaveBeenCalled(), { timeout: 2000 })

    const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
    expect(alert).toHaveTextContent('42s')
  })

  // --- Finding 2: a second pick must not be overwritten by a slower first ---

  it('a slower first pick cannot overwrite a faster second pick', async () => {
    const songA = { title: 'Song A', artist: 'Artist' }
    const songB = { title: 'Song B', artist: 'Artist' }
    vi.mocked(searchSongs).mockResolvedValue([songA, songB])

    const first = deferred<{ raw: { text: string; timeMs?: number }[]; lrclibId?: number } | null>()
    const second = deferred<{ raw: { text: string; timeMs?: number }[]; lrclibId?: number } | null>()
    vi.mocked(fetchLyrics).mockImplementation(async (c) =>
      (c.title === songA.title ? first.promise : second.promise))

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox'), '歌')
    await screen.findByRole('button', { name: /Song A/ }, { timeout: 2000 })

    // Pick A, then pick B before A has resolved.
    await user.click(screen.getByRole('button', { name: /Song A/ }))
    await user.click(screen.getByRole('button', { name: /Song B/ }))

    // Resolve OUT OF ORDER: the slower first pick (A) settles after the
    // second, faster one (B).
    second.resolve({ raw: [{ text: '一齊' }], lrclibId: 2 })
    await screen.findByRole('button', { name: /一/ }, { timeout: 3000 })

    first.resolve({ raw: [{ text: '唱歌' }], lrclibId: 1 })
    // Give A's now-stale annotate() chain (its own script-detection awaits)
    // every chance to run and wrongly overwrite the screen before asserting
    // it didn't.
    await flush()
    await flush()

    expect(screen.queryByRole('button', { name: /唱/ })).toBeNull()
    expect(screen.getByRole('button', { name: /一/ })).toBeInTheDocument()
  })

  // --- Finding 3: picking/pasting before the dictionary has loaded ---

  it('shows a notice and recovers automatically once the dictionary, still loading, arrives', async () => {
    const dictDeferred = deferred<Dict>()
    vi.mocked(loadDict).mockReturnValue(dictDeferred.promise)

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByText(/paste lyrics manually/i))
    await user.type(screen.getByLabelText(/paste any lyric text/i), '唱歌')
    await user.click(screen.getByRole('button', { name: /use these lyrics/i }))

    const notice = await screen.findByRole('alert', {}, { timeout: 2000 })
    expect(notice).toHaveTextContent(/dictionary/i)
    // The action was queued, not lost: nothing rendered yet.
    expect(screen.queryByRole('button', { name: /唱/ })).toBeNull()

    dictDeferred.resolve(createDict({}))

    // No further user action -- this must complete on its own.
    expect(await screen.findByRole('button', { name: /唱/ }, { timeout: 5000 })).toBeInTheDocument()
  })

  // --- Finding 4 (this pass): picking an already-cached song must reuse it
  // instead of refetching -- this is what the IndexedDB song cache
  // (src/storage/index.ts) exists for. ---

  it('caches a picked song and reuses it on a second pick without a network call', async () => {
    const songA = { title: 'Song A', artist: 'Artist' }
    vi.mocked(searchSongs).mockResolvedValue([songA])
    vi.mocked(fetchLyrics).mockResolvedValue({ raw: [{ text: '唱歌' }], lrclibId: 7 })

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox'), '歌')
    await screen.findByRole('button', { name: /Song A/ }, { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: /Song A/ }))
    expect(await screen.findByRole('button', { name: /唱/ }, { timeout: 2000 })).toBeInTheDocument()
    expect(fetchLyrics).toHaveBeenCalledTimes(1)

    // Let the fire-and-forget IndexedDB write from the first pick settle
    // before picking again.
    await flush()
    await flush()

    // Clear the rendered lyric via a paste-triggered no-op is unnecessary --
    // just pick the SAME result again and confirm no second fetch happens.
    await user.click(screen.getByRole('button', { name: /Song A/ }))
    expect(await screen.findByRole('button', { name: /唱/ }, { timeout: 2000 })).toBeInTheDocument()
    expect(fetchLyrics).toHaveBeenCalledTimes(1) // still 1 -- the cache served the second pick
  })

  // --- Finding 4: createPlayer must be constructed exactly once ---

  it('constructs the player exactly once, even across re-renders', () => {
    const { rerender } = render(<App />)
    // A play button proves a Player was wired up and is responding to
    // state; re-rendering must not visibly break (or reconstruct) it.
    rerender(<App />)
    rerender(<App />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  // --- Finding 5: the audio context must never resume itself ---

  it('never calls AudioContext.resume() on mount or re-render, only on user interaction', () => {
    const resume = vi.fn(async () => {})
    class SpyAudioContext {
      state: AudioContextState = 'suspended'
      currentTime = 0
      destination = {} as AudioDestinationNode
      resume = resume
      decodeAudioData = async () => ({ duration: 0 }) as AudioBuffer
      createBufferSource = () => ({ buffer: null, connect: () => {}, start: () => {}, stop: () => {} })
    }
    vi.stubGlobal('AudioContext', SpyAudioContext)

    const { rerender } = render(<App />)
    rerender(<App />)

    expect(resume).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// 天 is `tin1` in Jyutping and `tian1` (displayed `tiān`) in pinyin; 空 is
// `hung1` / `kong1` (`kōng`). Short synthetic phrases only -- no lyric
// fixtures ever live in this repo.
const YUE_TIN = 'tin1'
const CMN_TIAN = 'tiān'
// What a Jyutping syllable looks like if it is rendered through the MANDARIN
// pack's tone-marker: numToMark cannot tell `tin1` from a canonical pinyin
// key, so it happily marks it. Seeing either of these on screen means lines
// annotated by one pack were rendered by the other.
const YUE_UNDER_CMN = ['tīn', 'hūng']
// ...and the mirror: pinyin keys rendered through the Cantonese pack, whose
// default style is the identity function, so the raw tone NUMBER shows.
const CMN_UNDER_YUE = ['tian1', 'kong1']
// A second phrase, to tell "the song you picked" from "the song you were
// already looking at". 你好 is `nei5 hou2` / `nǐ hǎo`.
const YUE_NEI = 'nei5'
const CMN_NI = 'nǐ'

async function pasteLyric(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByText(/paste lyrics manually/i))
  await user.type(screen.getByLabelText(/paste any lyric text/i), text)
  await user.click(screen.getByRole('button', { name: /use these lyrics/i }))
}

describe('language toggle', () => {
  beforeEach(() => {
    vi.mocked(searchSongs).mockReset()
    vi.mocked(fetchLyrics).mockReset()
    vi.mocked(loadDict).mockReset().mockResolvedValue(createDict({}))
  })

  it('re-annotates the lyric in pinyin without refetching', async () => {
    const user = userEvent.setup()
    render(<App />)
    // Paste is the shortest path to a rendered lyric with no network at all.
    await pasteLyric(user, '天空')

    expect(await screen.findByText(YUE_TIN)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /普通話/ }))

    expect(await screen.findByText(CMN_TIAN)).toBeInTheDocument()
    expect(screen.queryByText(YUE_TIN)).not.toBeInTheDocument()
    // Nothing was fetched: the toggle is a pure recompute over the raw lines.
    expect(fetchLyrics).not.toHaveBeenCalled()
  })

  it('defaults a pasted lyric to Cantonese', async () => {
    const user = userEvent.setup()
    render(<App />)
    await pasteLyric(user, '天空')

    await screen.findByText(YUE_TIN)
    expect(screen.getByRole('button', { name: /粵語/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles back to Cantonese', async () => {
    const user = userEvent.setup()
    render(<App />)
    await pasteLyric(user, '天空')
    await screen.findByText(YUE_TIN)

    await user.click(screen.getByRole('button', { name: /普通話/ }))
    await screen.findByText(CMN_TIAN)

    await user.click(screen.getByRole('button', { name: /粵語/ }))
    expect(await screen.findByText(YUE_TIN)).toBeInTheDocument()
    expect(screen.queryByText(CMN_TIAN)).not.toBeInTheDocument()
  })

  // --- THE render-ordering hazard this task exists to make impossible ---
  //
  // If `lines` and the pack that produced them are separate pieces of state,
  // React commits at least one render with the NEW pack and the OLD lines.
  // In that render every Cantonese syllable is displayed as fake pinyin
  // (`tin1` -> `tīn`) because numToMark cannot distinguish a Jyutping
  // syllable with tone 1-4 from a canonical pinyin key. It is a transient
  // frame, so a plain post-hoc assertion cannot see it -- watch EVERY commit.
  it('never shows a syllable rendered by a pack that did not annotate it, even mid-switch', async () => {
    const script = await import('./script')
    const realToSimplified = script.toSimplified
    const realIsSimplified = script.isSimplified

    // Hold the script conversion — the first await inside annotate() — open
    // across a real macrotask, in BOTH directions. This is not incidental:
    // the offending render is queued between "the pack changed" and "the
    // lines changed", and with a two-character line the two state writes land
    // in the same scheduler task, so React never commits the bad frame and
    // the test would pass against the very bug it exists to catch. Widening
    // the window is what gives this test teeth; a real lyric of 40 lines
    // widens it on its own.
    const stall = () => new Promise((r) => setTimeout(r, 50))
    const toSimp = vi.spyOn(script, 'toSimplified')
      .mockImplementation(async (t: string) => { await stall(); return realToSimplified(t) })
    const isSimp = vi.spyOn(script, 'isSimplified')
      .mockImplementation(async (t: string) => { await stall(); return realIsSimplified(t) })

    try {
      const user = userEvent.setup()
      render(<App />)
      await pasteLyric(user, '天空')
      await screen.findByText(YUE_TIN, {}, { timeout: 3000 })

      const seen: string[] = [document.body.textContent ?? '']
      const observer = new MutationObserver(() => { seen.push(document.body.textContent ?? '') })
      observer.observe(document.body, { subtree: true, childList: true, characterData: true })

      try {
        await user.click(screen.getByRole('button', { name: /普通話/ }))
        await screen.findByText(CMN_TIAN, {}, { timeout: 3000 })
        seen.push(document.body.textContent ?? '')

        await user.click(screen.getByRole('button', { name: /粵語/ }))
        await screen.findByText(YUE_TIN, {}, { timeout: 3000 })
        seen.push(document.body.textContent ?? '')
      } finally {
        observer.disconnect()
      }

      // Every intermediate commit, not just the settled one.
      expect(seen.length).toBeGreaterThan(1)
      for (const snapshot of seen) {
        for (const bad of [...YUE_UNDER_CMN, ...CMN_UNDER_YUE]) {
          expect(snapshot).not.toContain(bad)
        }
      }
    } finally {
      toSimp.mockRestore()
      isSimp.mockRestore()
    }
  })

  // The same hazard, for audio: a tap must reach the bank belonging to the
  // pack that produced the lines on screen, not the one the toggle wants.
  it('plays clips from the audio bank of the pack that annotated the lines', async () => {
    const requested: string[] = []
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      if (url.includes('data/syllables.json')) {
        return new Response(JSON.stringify(['tin1', 'hung1']), { status: 200 })
      }
      if (url.includes('data/pinyin.json')) {
        return new Response(JSON.stringify(['tian1', 'kong1']), { status: 200 })
      }
      return new Response(new ArrayBuffer(8), { status: 200 })
    })
    vi.stubGlobal('fetch', fakeFetch)

    try {
      const user = userEvent.setup()
      render(<App />)
      await pasteLyric(user, '天空')
      await screen.findByText(YUE_TIN)

      await user.click(screen.getByRole('button', { name: /普通話/ }))
      await screen.findByText(CMN_TIAN)

      requested.length = 0
      await user.click(screen.getByRole('button', { name: /天/ }))
      await waitFor(
        () => expect(requested.some((u) => u.includes('audio/pin/tian1.mp3'))).toBe(true),
        { timeout: 2000 },
      )
      expect(requested.some((u) => u.includes('audio/syl/'))).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // ...and the transient half of the same hazard: while a switch is in
  // flight the toggle already reads 普通話 but the lyric on screen is still
  // Jyutping. An engine derived from the DESIRED pack would, in that window,
  // send a tap to the pinyin bank for a Jyutping key -- silence, because
  // `tin1` is not in the pinyin manifest.
  it('a tap during a language switch still plays from the bank of the lines on screen', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      if (url.includes('data/syllables.json')) {
        return new Response(JSON.stringify(['tin1', 'hung1']), { status: 200 })
      }
      if (url.includes('data/pinyin.json')) {
        return new Response(JSON.stringify(['tian1', 'kong1']), { status: 200 })
      }
      return new Response(new ArrayBuffer(8), { status: 200 })
    }))

    const script = await import('./script')
    const realToSimplified = script.toSimplified
    const toSimp = vi.spyOn(script, 'toSimplified').mockImplementation(async (t: string) => {
      await new Promise((r) => setTimeout(r, 100))
      return realToSimplified(t)
    })

    try {
      const user = userEvent.setup()
      render(<App />)
      await pasteLyric(user, '天空')
      await screen.findByText(YUE_TIN, {}, { timeout: 3000 })

      // fireEvent, not userEvent: start the switch WITHOUT awaiting it.
      fireEvent.click(screen.getByRole('button', { name: /普通話/ }))

      // The mismatch window: the toggle has moved, the lyric has not.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'true')
      }, { timeout: 2000 })
      expect(screen.getByText(YUE_TIN)).toBeInTheDocument()

      requested.length = 0
      fireEvent.click(screen.getByRole('button', { name: /天/ }))

      await waitFor(
        () => expect(requested.some((u) => u.includes('audio/syl/tin1.mp3'))).toBe(true),
        { timeout: 2000 },
      )
      expect(requested.some((u) => u.includes('audio/pin/'))).toBe(false)
    } finally {
      toSimp.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('reverts the toggle with a message when the language pack fails to load', async () => {
    const user = userEvent.setup()
    render(<App />)
    await pasteLyric(user, '天空')
    await screen.findByText(YUE_TIN)

    // Simulate the lazy chunk failing (offline). getPack memoises on the
    // PROMISE and clears that memo on failure, so this only breaks this call.
    const lang = await import('./lang')
    const spy = vi.spyOn(lang, 'getPack').mockRejectedValueOnce(new Error('offline'))

    try {
      await user.click(screen.getByRole('button', { name: /普通話/ }))

      const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
      expect(alert).toHaveTextContent(/could not load that language/i)
      // Not half-switched: the toggle is back where it was and the lyric is
      // still the Cantonese one it was already showing.
      expect(screen.getByRole('button', { name: /粵語/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByText(YUE_TIN)).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  // --- Generation ordering across the language switch (fix round 1) ---
  //
  // The language switch awaits a 288 kB lazy chunk, and SearchBar is NOT
  // disabled while it does (only the toggle is). So a pick can begin, and
  // finish, entirely inside a switch that is still in flight. The switch is
  // therefore the OLDER action and must lose -- which only holds if it takes
  // its generation at entry, like every other action, rather than bumping
  // after its await.

  // Stalls the lazy pack import so the window between "switch started" and
  // "switch resolved" is wide enough to drive a whole pick through.
  async function stallGetPack(ms = 150) {
    const lang = await import('./lang')
    const real = lang.getPack
    return vi.spyOn(lang, 'getPack').mockImplementation(async (id) => {
      await new Promise((r) => setTimeout(r, ms))
      return real(id)
    })
  }

  it('a pick started during a language switch wins, and the switch does not strand busy', async () => {
    vi.mocked(searchSongs).mockResolvedValue([{ title: 'Song A', artist: 'Artist' }])
    const lyrics = deferred<{ raw: { text: string; timeMs?: number }[]; lrclibId?: number } | null>()
    vi.mocked(fetchLyrics).mockReturnValue(lyrics.promise)

    const spy = await stallGetPack()
    try {
      const user = userEvent.setup()
      render(<App />)
      await pasteLyric(user, '天空')
      await screen.findByText(YUE_TIN, {}, { timeout: 3000 })

      await user.type(screen.getByRole('searchbox'), '歌')
      await screen.findByRole('button', { name: /Song A/ }, { timeout: 3000 })

      // fireEvent: start each action WITHOUT awaiting it.
      fireEvent.click(screen.getByRole('button', { name: /普通話/ }))
      fireEvent.click(screen.getByRole('button', { name: /Song A/ }))

      // Let the stalled getPack resolve while the pick is still awaiting its
      // lyrics. This is the whole race: the older switch completes second.
      await new Promise((r) => setTimeout(r, 300))
      lyrics.resolve({ raw: [{ text: '你好' }], lrclibId: 31 })

      // The song the user actually chose must be what renders.
      expect(await screen.findByText(YUE_NEI, {}, { timeout: 3000 })).toBeInTheDocument()
      // ...and the previous song must not have been re-annotated over it.
      expect(screen.queryByText(YUE_TIN)).toBeNull()
      expect(screen.queryByText(CMN_TIAN)).toBeNull()

      // A stranded `busy` leaves "Searching…" (role=status) up forever.
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 2000 })
    } finally {
      spy.mockRestore()
    }
  })

  it('a superseded pick does not move the toggle away from the language on screen', async () => {
    vi.mocked(searchSongs).mockResolvedValue([
      { title: 'Song A', artist: 'Artist', genre: 'Mandopop', langGuess: 'cmn' },
      { title: 'Song B', artist: 'Artist' },
    ])
    vi.mocked(fetchLyrics).mockImplementation(async (c) =>
      (c.title === 'Song A'
        ? { raw: [{ text: '天空' }], lrclibId: 41 }
        : { raw: [{ text: '你好' }], lrclibId: 42 }))

    const spy = await stallGetPack(300)
    try {
      const user = userEvent.setup()
      render(<App />)

      await user.type(screen.getByRole('searchbox'), '歌')
      await screen.findByRole('button', { name: /Song A/ }, { timeout: 3000 })

      // A wants Mandarin and stalls inside getPack; B wants nothing in
      // particular and sails past it, so B lands first and wins.
      fireEvent.click(screen.getByRole('button', { name: /Song A/ }))
      // Wait until A is provably INSIDE the stall before starting B. Clicking
      // both back-to-back does not reproduce the race at all: A would bail at
      // its own post-fetchLyrics generation check and never reach selectPack,
      // and the test would pass against the bug it exists to catch.
      await waitFor(() => expect(spy).toHaveBeenCalledWith('cmn'), { timeout: 3000 })
      fireEvent.click(screen.getByRole('button', { name: /Song B/ }))

      expect(await screen.findByText(YUE_NEI, {}, { timeout: 3000 })).toBeInTheDocument()

      // Now let A's getPack resolve. A has already lost, so it must not
      // move the toggle: `view` stays coherent either way, but a toggle
      // reading 普通話 over a Jyutping lyric is a control that lies.
      await new Promise((r) => setTimeout(r, 300))

      expect(screen.getByRole('button', { name: /粵語/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByText(YUE_NEI)).toBeInTheDocument()
      expect(screen.queryByText(CMN_NI)).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  // The same stranded-`busy` failure mode as the first test above, reached
  // without the language toggle at all: PasteBox is never disabled, so a
  // paste can supersede an in-flight pick. Pre-existing, but it is the same
  // line of code and the same user-visible symptom.
  it('a paste that supersedes an in-flight pick does not strand busy', async () => {
    vi.mocked(searchSongs).mockResolvedValue([{ title: 'Song A', artist: 'Artist' }])
    const lyrics = deferred<{ raw: { text: string; timeMs?: number }[]; lrclibId?: number } | null>()
    vi.mocked(fetchLyrics).mockReturnValue(lyrics.promise)

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox'), '歌')
    await screen.findByRole('button', { name: /Song A/ }, { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: /Song A/ }))
    expect(screen.getByRole('status')).toBeInTheDocument() // "Searching…"

    // Give up waiting and paste instead -- which is exactly what the paste
    // box is there for.
    await pasteLyric(user, '你好')
    expect(await screen.findByText(YUE_NEI, {}, { timeout: 3000 })).toBeInTheDocument()

    lyrics.resolve({ raw: [{ text: '天空' }], lrclibId: 51 })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 2000 })
    expect(screen.getByText(YUE_NEI)).toBeInTheDocument()
  })

  it('seeds the toggle from the candidate langGuess on pick', async () => {
    vi.mocked(searchSongs).mockResolvedValue([
      { title: 'Song A', artist: 'Artist', genre: 'Mandopop', langGuess: 'cmn' },
    ])
    vi.mocked(fetchLyrics).mockResolvedValue({ raw: [{ text: '天空' }], lrclibId: 11 })

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox'), '歌')
    await screen.findByRole('button', { name: /Song A/ }, { timeout: 2000 })
    await user.click(screen.getByRole('button', { name: /Song A/ }))

    expect(await screen.findByText(CMN_TIAN, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'true')
    // ...and the annotation really came from the Mandarin pack, not from the
    // Cantonese one with the toggle merely pointing elsewhere.
    expect(screen.queryByText(YUE_TIN)).not.toBeInTheDocument()
  })

  it('seeds the toggle from the cached langGuess when the candidate has none', async () => {
    const { cacheLyric } = await import('./storage')
    await cacheLyric({
      lrclibId: 21, title: 'Song B', artist: 'Artist',
      raw: [{ text: '天空' }], langGuess: 'cmn',
    })
    vi.mocked(searchSongs).mockResolvedValue([{ title: 'Song B', artist: 'Artist' }])

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox'), '歌')
    await screen.findByRole('button', { name: /Song B/ }, { timeout: 2000 })
    await user.click(screen.getByRole('button', { name: /Song B/ }))

    expect(await screen.findByText(CMN_TIAN, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(fetchLyrics).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
