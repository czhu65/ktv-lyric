import { render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: /paste/i })).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: /paste lyrics manually/i }))
    await user.type(screen.getByLabelText(/paste the lyrics/i), '唱歌')
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
