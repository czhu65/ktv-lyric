import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchSongs, fetchLyrics, RateLimitError } from './search'
import { parseLyricText } from './lyrics/parse'
import { normalize, isSimplified, toTraditional } from './script'
import { annotateLine } from './annotate'
import { loadDict, type Dict } from './dict'
import { createAudioEngine } from './audio'
import { createPlayer, type Player, type PlayerState } from './player'
import { loadSettings, saveSettings, cacheSong, getCachedSongByTitleArtist, type Settings } from './storage'
import type { Line, Song, SongCandidate } from './types'
import SearchBar from './ui/SearchBar'
import PasteBox from './ui/PasteBox'
import Transport from './ui/Transport'
import SettingsPanel from './ui/SettingsPanel'
import LyricView from './ui/LyricView'
import Credits from './ui/Credits'

// Shared by onSearch and onPick: whichever path hits LRCLIB's rate limit,
// the user sees the identical, delay-naming message rather than two
// independently-worded (and driftable) copies of it.
function rateLimitNotice(e: RateLimitError): string {
  return `Rate limited by LRCLIB — retry in ${e.retryAfterSec}s, or paste the lyrics below.`
}

export default function App() {
  const [dict, setDict] = useState<Dict | null>(null)
  const [results, setResults] = useState<SongCandidate[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [pstate, setPstate] = useState<PlayerState>(
    { playing: false, lineIndex: -1, charIndex: -1, error: null },
  )
  // Becomes true once the audio manifest has loaded (see the mount effect
  // below). Threaded down to LyricView/LyricLine as a real prop so
  // React.memo picks up the transition and every line gets one settle-render
  // -- see Finding 2: has() defaults to "available" before the manifest
  // loads, and without this, a line that never becomes active would never
  // re-render to pick up the real answer once the manifest does arrive.
  const [audioReady, setAudioReady] = useState(false)

  const ctx = useMemo(() => new AudioContext(), [])
  const engine = useMemo(() => createAudioEngine(ctx), [ctx])
  // Lazy ref init: a bare `useRef(createPlayer(...))` calls createPlayer(...)
  // on EVERY render (React discards all but the first result), constructing
  // and immediately throwing away a Player each time. `??=` short-circuits,
  // so createPlayer only ever runs once, on the render that first sees a
  // null ref.
  const playerRef = useRef<Player | null>(null)
  playerRef.current ??= createPlayer({
    engine,
    now: () => ctx.currentTime,
    // setTimeout, NEVER setInterval.
    schedule: (fn, ms) => void setTimeout(fn, ms),
  })
  const player = playerRef.current

  // Bumped on every new pick and every paste submission. Both fetchLyrics
  // (network) and annotate (async script detection) can resolve out of
  // order across two overlapping actions -- the same class of race
  // src/player/index.ts solves with its own `generation` counter. Any
  // setLines/setNotice that follows an await is gated on this so a slow,
  // stale action can never clobber a newer one's result.
  const genRef = useRef(0)

  // Holds the most recent pick/paste that arrived while the dictionary was
  // still loading. Overwritten (never queued as a list) so that once the
  // dictionary lands, only the LATEST such action replays -- consistent
  // with the generation guard's "only the most recent action may commit"
  // rule rather than fighting it.
  const pendingRef = useRef<{ raw: { text: string; timeMs?: number }[]; gen: number } | null>(null)

  useEffect(() => { loadDict().then(setDict).catch(() => setNotice('Dictionary failed to load')) }, [])
  useEffect(() => player.subscribe(setPstate), [player])
  useEffect(() => {
    saveSettings(settings)
    player.setInterLineGap(settings.interLineGapSec)
  }, [settings, player])

  // preloadManifest() fetches ONLY the syllable manifest -- unlike unlock(),
  // it never calls AudioContext.resume(), so it's safe to run at mount with
  // no user gesture. This is what lets has() settle to real answers (see
  // Finding 2) before the user has tapped or played anything, instead of
  // only ever settling reactively off of whichever line happens to become
  // active during playback.
  useEffect(() => {
    let cancelled = false
    engine.preloadManifest()
      .then(() => { if (!cancelled) setAudioReady(true) })
      .catch(() => { if (!cancelled) setNotice('Audio failed to load — playback may not work. Try reloading.') })
    return () => { cancelled = true }
  }, [engine])

  // Surfaces a failed unlock()/prefetch() from the player (Finding 3) --
  // without this, a 404'd manifest fetch inside start() would fail
  // invisibly: no notice, and (before the player-side fix) an unhandled
  // promise rejection.
  useEffect(() => {
    if (pstate.error) setNotice('Audio failed to load — playback may not work. Try reloading.')
  }, [pstate.error])

  // Returns the annotated lines on success so callers that need them for
  // more than just display (Finding 4: onPick caches a Song built from
  // them) don't have to re-derive them from state. Returns undefined both
  // when queued (dict not ready yet) and when superseded by a newer
  // pick/paste -- either way there is nothing a caller could safely use.
  const annotate = useCallback(async (
    raw: { text: string; timeMs?: number }[], gen: number,
  ): Promise<Line[] | undefined> => {
    if (!dict) {
      // The dictionary is fetched over the network and may not have landed
      // yet. Silently no-op-ing here (the old behaviour) leaves the user
      // staring at a pick/paste that visibly did nothing. Queue this action
      // and recover automatically -- see the "Fix round 1" report for why
      // auto-retry was chosen over an ask-the-user-to-retry message.
      pendingRef.current = { raw, gen }
      setNotice('Dictionary is still loading — this will continue automatically once it finishes.')
      return undefined
    }
    const out: Line[] = []
    for (const l of raw) {
      // Never feed Simplified to to-jyutping — it fails silently on mergers.
      // toTraditional is NOT idempotent on Traditional input — it still
      // normalises glyph variants (e.g. it can rewrite a word's characters
      // to a different, equally-Traditional spelling), so Traditional
      // lyrics must pass through untouched rather than being run through
      // conversion. Detect first, and only convert text that is actually
      // Simplified.
      let text = normalize(l.text)
      if (await isSimplified(text)) text = await toTraditional(text)
      // Annotate the WHOLE line. A break inside a word changes the reading.
      out.push({
        tokens: annotateLine(text, { words: dict.keys(), maxWordLength: dict.maxKeyLength }),
        timeMs: l.timeMs,
      })
    }
    if (gen !== genRef.current) return undefined // a newer pick/paste has since won
    setLines(out)
    return out
  }, [dict])

  // Once the dictionary lands, replay whichever pick/paste got queued (by
  // `annotate`'s `!dict` branch above) while it was still loading.
  useEffect(() => {
    if (!dict || !pendingRef.current) return
    const pending = pendingRef.current
    pendingRef.current = null
    void annotate(pending.raw, pending.gen)
  }, [dict, annotate])

  const onSearch = useCallback(async (q: string) => {
    setBusy(true); setNotice(null)
    try {
      setResults(await searchSongs(q))
    } catch (e) {
      // Searching is the FIRST thing a user does, so it is the more likely
      // path to hit LRCLIB's rate limit -- it must name the retry delay
      // just like onPick does, not fall back to a generic message.
      setNotice(e instanceof RateLimitError ? rateLimitNotice(e) : 'Search is unavailable. You can paste the lyrics instead.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onPick = useCallback(async (c: SongCandidate) => {
    genRef.current++
    const gen = genRef.current
    setBusy(true); setNotice(null)
    try {
      // Finding 4: a SongCandidate never carries LRCLIB's id (that's only
      // learned from the fetch below), so title+artist is the only key
      // available before any network call -- see getCachedSongByTitleArtist's
      // own comment in storage/index.ts. A hit here skips fetchLyrics
      // entirely: no network call, and the lines are already annotated.
      // Wrapped separately so a cache-read failure (e.g. no IndexedDB
      // support) fails OPEN into a normal fetch, rather than aborting the
      // pick via the outer catch below.
      const cached = await getCachedSongByTitleArtist(c.title, c.artist).catch(() => null)
      if (cached) {
        if (gen === genRef.current) setLines(cached.lines)
        return
      }

      const result = await fetchLyrics(c)
      if (gen !== genRef.current) return // superseded by a later pick
      if (!result) { setNotice('No lyrics found for that track. Paste them below to continue.'); return }

      const out = await annotate(result.raw, gen)
      // out is undefined if annotate queued (dict still loading) or was
      // itself superseded -- either way there's nothing new to cache yet.
      // lrclibId can be missing on an otherwise-valid LRCLIB record; caching
      // requires it since it's the cache's own lookup key.
      if (out && result.lrclibId != null) {
        const song: Song = { title: c.title, artist: c.artist, lines: out, source: 'lrclib', lrclibId: result.lrclibId }
        // Fire-and-forget: a failed write shouldn't block playback, and (per
        // Finding 3's lesson) must not escape as an unhandled rejection.
        void cacheSong(song).catch(() => {})
      }
    } catch (e) {
      if (gen !== genRef.current) return
      setNotice(
        e instanceof RateLimitError
          ? rateLimitNotice(e)
          : 'Lyric lookup failed. Paste the lyrics below to continue.',
      )
    } finally {
      // Only the latest pick may clear `busy` -- a stale pick's finally
      // must not flip it false out from under a newer pick still in flight.
      if (gen === genRef.current) setBusy(false)
    }
  }, [annotate])

  const onPaste = useCallback((text: string) => {
    genRef.current++
    const gen = genRef.current
    setNotice(null)
    void annotate(parseLyricText(text), gen)
  }, [annotate])

  return (
    <main>
      <h1>KTV Lyric</h1>
      <SearchBar onSearch={onSearch} onPick={onPick} results={results} busy={busy} />
      {notice && <p role="alert">{notice}</p>}
      <PasteBox onSubmit={onPaste} />
      <SettingsPanel settings={settings} onChange={setSettings} />

      {lines.length > 0 && dict && (
        <>
          <Transport
            playing={pstate.playing}
            onPlayAll={() => player.playAll(lines)}
            onStop={() => player.stop()}
          />
          <LyricView
            lines={lines} dict={dict} engine={engine} settings={settings}
            activeLine={pstate.lineIndex} activeChar={pstate.charIndex}
            audioReady={audioReady}
            onPlayLine={(i) => player.playLine(lines[i], i)}
          />
        </>
      )}
      <Credits />
    </main>
  )
}
