import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchSongs, fetchLyrics, RateLimitError } from './search'
import { parseLyricText } from './lyrics/parse'
import { normalize, isSimplified, toTraditional } from './script'
import { annotateLine } from './annotate'
import { loadDict, type Dict } from './dict'
import { createAudioEngine } from './audio'
import { createPlayer, type Player, type PlayerState } from './player'
import { loadSettings, saveSettings, type Settings } from './storage'
import type { Line, SongCandidate } from './types'
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
    { playing: false, lineIndex: -1, charIndex: -1 },
  )

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

  const annotate = useCallback(async (raw: { text: string; timeMs?: number }[], gen: number) => {
    if (!dict) {
      // The dictionary is fetched over the network and may not have landed
      // yet. Silently no-op-ing here (the old behaviour) leaves the user
      // staring at a pick/paste that visibly did nothing. Queue this action
      // and recover automatically -- see the "Fix round 1" report for why
      // auto-retry was chosen over an ask-the-user-to-retry message.
      pendingRef.current = { raw, gen }
      setNotice('Dictionary is still loading — this will continue automatically once it finishes.')
      return
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
    if (gen !== genRef.current) return // a newer pick/paste has since won
    setLines(out)
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
      const raw = await fetchLyrics(c)
      if (gen !== genRef.current) return // superseded by a later pick
      if (!raw) setNotice('No lyrics found for that track. Paste them below to continue.')
      else await annotate(raw, gen)
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
            onPlayLine={(i) => player.playLine(lines[i])}
          />
        </>
      )}
      <Credits />
    </main>
  )
}
