import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchSongs, fetchLyrics, RateLimitError } from './search'
import { parseLyricText, type SourceLine } from './lyrics/parse'
import { normalize, isSimplified, toTraditional, toSimplified } from './script'
import { loadDict, type Dict } from './dict'
import { createAudioEngine } from './audio'
import { createPlayer, type PlayerState } from './player'
import { loadSettings, saveSettings, cacheLyric, getCachedLyricByTitleArtist, type Settings } from './storage'
import { getPack, yuePack, type LangId, type LanguagePack } from './lang'
import type { Line, SongCandidate } from './types'
import SearchBar from './ui/SearchBar'
import PasteBox from './ui/PasteBox'
import Transport from './ui/Transport'
import SettingsPanel from './ui/SettingsPanel'
import LangToggle from './ui/LangToggle'
import LyricView from './ui/LyricView'
import Credits from './ui/Credits'
import ThemeToggle from './ui/ThemeToggle'

/**
 * The annotated lines AND the pack that produced them, as ONE value.
 *
 * They are inseparable, so they are stored inseparably. Holding them as two
 * pieces of state would let React commit renders in which they disagree --
 * and a disagreement here is silent, not loud: `numToMark` cannot tell a
 * Jyutping syllable carrying tone 1-4 from a canonical pinyin key, so
 * Cantonese `tin1` rendered under the Mandarin pack displays as a
 * plausible-looking `tīn` rather than throwing. Every syllable on screen
 * would be quietly wrong for a frame.
 *
 * Nothing downstream may read the DESIRED pack (`pack` below). LyricView,
 * LangToggle's audio bank and the player all hang off this object instead,
 * which makes the mismatched render unrepresentable rather than merely
 * unlikely.
 */
interface View {
  lines: Line[]
  pack: LanguagePack
}

// Shared by onSearch and onPick: whichever path hits LRCLIB's rate limit,
// the user sees the identical, delay-naming message rather than two
// independently-worded (and driftable) copies of it.
function rateLimitNotice(e: RateLimitError): string {
  return `Rate limited by LRCLIB — retry in ${e.retryAfterSec}s, or paste the lyrics below.`
}

export default function App() {
  const [dict, setDict] = useState<Dict | null>(null)
  const [results, setResults] = useState<SongCandidate[]>([])
  const [view, setView] = useState<View | null>(null)
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

  // The DESIRED language for the current song: what the toggle shows and
  // what the next annotate() call will use. Deliberately not persisted --
  // it is a per-song property seeded from a per-track genre guess, so
  // carrying it across songs would be wrong more often than right.
  //
  // There is no separate `lang` state because `pack.id` IS the LangId: two
  // fields that must always agree are one field. The pack objects are module
  // singletons, so this doubles as a stable useMemo/useCallback dependency.
  const [pack, setPack] = useState<LanguagePack>(yuePack)
  const [packBusy, setPackBusy] = useState(false)

  // The raw source lines behind whatever `view` currently shows. Kept so the
  // toggle can re-annotate without refetching -- this is what the storage
  // change in Task 10 exists to make possible.
  //
  // A ref rather than state: nothing renders it, and it is written in the
  // same step as `view` (below the same generation guard), so the two can
  // never disagree. Keeping it out of state also keeps it out of
  // onLangChange's dependency array, which would otherwise churn the
  // identity of every callback downstream of it on every new lyric.
  const rawRef = useRef<SourceLine[]>([])

  const ctx = useMemo(() => new AudioContext(), [])
  // The audio bank follows the DISPLAYED pack, never the desired one. Each
  // language has its own clip directory, manifest and LRU, and during a
  // switch the two packs differ for a render or two -- a tap in that window
  // would fetch a clip from the bank the user is leaving. Reading the pack
  // off `view` makes that impossible for the same reason it does for the
  // ruby text. Swapping the object also discards the previous language's
  // decoded buffers, which is desirable: they are useless now and would
  // otherwise sit in memory.
  const enginePack = view?.pack ?? yuePack
  const engine = useMemo(
    () => createAudioEngine(ctx, { dir: enginePack.audioDir, manifest: enginePack.manifest }),
    [ctx, enginePack],
  )

  // The player captures its engine at construction, so it has to be rebuilt
  // alongside it -- otherwise "play line" after a language switch would
  // prefetch pinyin keys out of the Cantonese directory. useMemo (not a bare
  // `useRef(createPlayer(...))`, which would construct and immediately throw
  // away a Player on EVERY render) keeps construction to once per engine.
  const player = useMemo(
    () => createPlayer({
      engine,
      now: () => ctx.currentTime,
      // setTimeout, NEVER setInterval.
      schedule: (fn, ms) => void setTimeout(fn, ms),
    }),
    [ctx, engine],
  )

  // Bumped on every new pick, paste submission and language switch. All of
  // fetchLyrics (network), getPack (a lazy chunk import) and annotate (async
  // script detection) can resolve out of order across two overlapping
  // actions -- the same class of race src/player/index.ts solves with its
  // own `generation` counter. Any setView/setNotice that follows an await is
  // gated on this so a slow, stale action can never clobber a newer one's
  // result.
  const genRef = useRef(0)

  // Holds the most recent pick/paste that arrived while the dictionary was
  // still loading. Overwritten (never queued as a list) so that once the
  // dictionary lands, only the LATEST such action replays -- consistent
  // with the generation guard's "only the most recent action may commit"
  // rule rather than fighting it. Carries its pack for the same reason
  // `view` does: the replay must annotate with the pack that was chosen for
  // it, not with whatever the toggle happens to say by the time it runs.
  const pendingRef = useRef<{ raw: SourceLine[]; pack: LanguagePack; gen: number } | null>(null)

  // The generation of the pick that most recently raised `busy`. See the
  // ownership argument in onPick's `finally` below.
  const busyPickRef = useRef(0)

  useEffect(() => { loadDict().then(setDict).catch(() => setNotice('Dictionary failed to load')) }, [])
  useEffect(() => {
    const unsubscribe = player.subscribe(setPstate)
    // Stop the OUTGOING player when a language switch replaces it: its
    // pump() loop is driven by setTimeout and would otherwise keep
    // scheduling clips from the bank the user just left.
    return () => { unsubscribe(); player.stop() }
  }, [player])
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
    // A new engine means a new language and a new inventory: go back to
    // "not yet known" so LyricLine doesn't mark characters as missing based
    // on the PREVIOUS language's manifest while this one is in flight.
    setAudioReady(false)
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

  // Takes the pack as an ARGUMENT rather than closing over `pack` state.
  // That is what makes the language switch atomic: the caller resolves the
  // pack first and hands it straight in, so annotate always commits lines
  // together with the exact pack that produced them, with no window in
  // which a state update could put the two out of step.
  //
  // Returns the annotated lines on success so callers that need them for
  // more than just display don't have to re-derive them from state. Returns
  // undefined both when queued (dict not ready yet) and when superseded by a
  // newer action -- either way there is nothing a caller could safely use.
  const annotate = useCallback(async (
    raw: SourceLine[], p: LanguagePack, gen: number,
  ): Promise<Line[] | undefined> => {
    if (!dict) {
      // The dictionary is fetched over the network and may not have landed
      // yet. Silently no-op-ing here (the old behaviour) leaves the user
      // staring at a pick/paste that visibly did nothing. Queue this action
      // and recover automatically -- see the "Fix round 1" report for why
      // auto-retry was chosen over an ask-the-user-to-retry message.
      pendingRef.current = { raw, pack: p, gen }
      setNotice('Dictionary is still loading — this will continue automatically once it finishes.')
      return undefined
    }
    const out: Line[] = []
    for (const l of raw) {
      // Each pack's annotator requires one script and fails quietly on the
      // other: to-jyutping loses Simplified mergers, and pinyin-pro's
      // polyphone table is Simplified-keyed. Convert to whichever this pack
      // asked for.
      let text = normalize(l.text)
      if (p.script === 'trad') {
        // toTraditional is NOT idempotent on Traditional input -- it still
        // normalises glyph variants -- so detect first and only convert text
        // that is actually Simplified.
        if (await isSimplified(text)) text = await toTraditional(text)
      } else {
        // t2s IS safe to run unconditionally, and this was verified rather
        // than assumed: sweeping every CJK Unified Ideograph in the BMP,
        // exactly ONE character is not a fixed point of t2s (薴 U+85B4
        // "limonene" -> 苧 -> 苎, an incomplete entry in opencc's own table),
        // and it is Traditional, not Simplified -- isSimplified(薴) is false,
        // so the detect-first shape used above would produce the identical
        // 苧 anyway. Genuine Simplified text passes through untouched.
        // Running it unconditionally also handles mixed-script lines, which
        // the detect-first branch cannot.
        text = await toSimplified(text)
      }
      // Annotate the WHOLE line. A break inside a word changes the reading.
      out.push({
        tokens: p.annotate(text, { words: dict.keys(), maxWordLength: dict.maxKeyLength }),
        timeMs: l.timeMs,
      })
    }
    if (gen !== genRef.current) return undefined // a newer action has since won
    rawRef.current = raw
    // ONE write. `out` and `p` reach the DOM in the same commit or not at all.
    setView({ lines: out, pack: p })
    return out
  }, [dict])

  // Once the dictionary lands, replay whichever pick/paste got queued (by
  // `annotate`'s `!dict` branch above) while it was still loading.
  useEffect(() => {
    if (!dict || !pendingRef.current) return
    const pending = pendingRef.current
    pendingRef.current = null
    void annotate(pending.raw, pending.pack, pending.gen)
  }, [dict, annotate])

  /**
   * Commit `next` as the desired language and hand back its pack -- or, if
   * the lazy Mandarin chunk cannot be fetched, leave the language exactly
   * where it is, post a notice, and hand back the CURRENT pack.
   *
   * Never throws and never half-switches. The returned pack is always the
   * one the caller should annotate with, so a failed switch degrades to
   * "still the old language, with an explanation" rather than to a toggle
   * and a lyric that disagree.
   *
   * Deliberately does NOT re-annotate: onPick needs the pack for a lyric it
   * is ABOUT to annotate, not for the one currently on screen.
   *
   * Takes its caller's generation because it commits state (`setPack`,
   * `setNotice`) of its own, across an await, BEFORE the caller gets control
   * back to run its own generation check. Checking here is the only place
   * that can stop a superseded action from moving the toggle.
   */
  const selectPack = useCallback(async (
    next: LangId | undefined, gen: number,
  ): Promise<LanguagePack> => {
    if (!next || next === pack.id) return pack
    try {
      const p = await getPack(next)
      // Don't move the toggle on behalf of an action that has already lost.
      // `view` stays coherent either way -- lines and pack are one object --
      // but the CONTROL would advertise a language that nothing on screen is
      // annotated in, and only a further tap would recover it.
      if (gen !== genRef.current) return pack
      setPack(p)
      return p
    } catch {
      // A lazy chunk fetch can fail offline. getPack clears its own memo on
      // failure, so a later retry is not permanently poisoned.
      if (gen !== genRef.current) return pack
      setNotice('Could not load that language. Check your connection and try again.')
      return pack
    }
  }, [pack])

  // Switching language re-annotates from the raw lines behind the current
  // view. No network, no refetch -- the cache holds raw text precisely so
  // this is a pure recompute.
  const onLangChange = useCallback(async (next: LangId) => {
    // Take the generation at ENTRY, exactly like onPick and onPaste. Bumping
    // it after the getPack await instead would make this switch SUPERSEDE
    // any pick the user began while the 288 kB Mandarin chunk was still
    // downloading -- and they can: packBusy disables the toggle, but nothing
    // disables SearchBar. The switch is the OLDER action and must lose.
    genRef.current++
    const gen = genRef.current
    setPackBusy(true)
    setNotice(null)
    try {
      const p = await selectPack(next, gen)
      if (gen !== genRef.current) return // a pick/paste started meanwhile has won
      if (p.id !== next) return // the switch failed; selectPack already said so
      if (rawRef.current.length === 0) return
      await annotate(rawRef.current, p, gen)
    } finally {
      // NOT gated on the generation, unlike `busy` below: onLangChange is the
      // only writer of packBusy, so a superseded switch that declined to
      // clear it would disable the toggle permanently.
      setPackBusy(false)
    }
  }, [annotate, selectPack])

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
    setBusy(true); busyPickRef.current = gen
    setNotice(null)
    try {
      // Finding 4: a SongCandidate never carries LRCLIB's id (that's only
      // learned from the fetch below), so title+artist is the only key
      // available before any network call -- see getCachedLyricByTitleArtist's
      // own comment in storage/index.ts. A hit here skips fetchLyrics
      // entirely: no network call, though the raw lines still need
      // annotating (the cache is language-independent; see storage/index.ts).
      // Wrapped separately so a cache-read failure (e.g. no IndexedDB
      // support) fails OPEN into a normal fetch, rather than aborting the
      // pick via the outer catch below.
      const cached = await getCachedLyricByTitleArtist(c.title, c.artist).catch(() => null)
      if (cached) {
        if (gen !== genRef.current) return
        // Seed the toggle from whichever guess we have: the fresh
        // candidate's wins, since the cached one may predate a genre-table
        // update. `undefined` means "no opinion" and keeps the current
        // language. Resolved BEFORE annotating, and threaded straight in --
        // switching the language and rendering this song are one step, not
        // two, so the cached lyric is never shown under the wrong pack (and
        // the previous song's lines are never re-annotated in its place).
        const p = await selectPack(c.langGuess ?? cached.langGuess, gen)
        if (gen !== genRef.current) return
        await annotate(cached.raw, p, gen)
        return
      }

      const result = await fetchLyrics(c)
      if (gen !== genRef.current) return // superseded by a later pick
      if (!result) { setNotice('No lyrics found for that track. Paste them below to continue.'); return }

      const p = await selectPack(c.langGuess, gen)
      if (gen !== genRef.current) return

      const out = await annotate(result.raw, p, gen)
      // out is undefined if annotate queued (dict still loading) or was
      // itself superseded -- either way there's nothing new to cache yet.
      // lrclibId can be missing on an otherwise-valid LRCLIB record; caching
      // requires it since it's the cache's own lookup key.
      if (out && result.lrclibId != null) {
        // Fire-and-forget: a failed write shouldn't block playback, and (per
        // Finding 3's lesson) must not escape as an unhandled rejection.
        void cacheLyric({
          lrclibId: result.lrclibId,
          title: c.title,
          artist: c.artist,
          raw: result.raw,
          // The guess, not the pack actually used: this records what the
          // metadata said, so a later pick reproduces the same seed even if
          // the user had manually overridden the toggle for this listen.
          langGuess: c.langGuess,
        }).catch(() => {})
      }
    } catch (e) {
      if (gen !== genRef.current) return
      setNotice(
        e instanceof RateLimitError
          ? rateLimitNotice(e)
          : 'Lyric lookup failed. Paste the lyrics below to continue.',
      )
    } finally {
      // Only the latest PICK may clear `busy` -- a stale pick's finally must
      // not flip it false out from under a newer pick still in flight.
      //
      // Gated on ownership, not on `gen === genRef.current`. `busy` belongs
      // exclusively to onPick, but genRef is bumped by onPaste and
      // onLangChange too, and neither of those ever clears `busy`. Gating on
      // the raw generation therefore stranded it at true -- a permanent
      // "Searching…" in SearchBar -- whenever a non-pick action superseded a
      // pick, which a paste can do at any time since PasteBox is never
      // disabled. busyPickRef records which pick actually put it up.
      if (busyPickRef.current === gen) setBusy(false)
    }
  }, [annotate, selectPack])

  // Pasted text carries no metadata to guess from, so it uses whichever
  // language is currently selected -- which for a fresh load is Cantonese.
  const onPaste = useCallback((text: string) => {
    genRef.current++
    const gen = genRef.current
    setNotice(null)
    void annotate(parseLyricText(text), pack, gen)
  }, [annotate, pack])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">
            KTV Lyrics<span className="zh">歌詞發音</span>
          </h1>
          <ThemeToggle
            theme={settings.theme}
            onChange={(t) => setSettings((s) => ({ ...s, theme: t }))}
          />
        </div>
      </header>

      <main className="app-main">
        <SearchBar onSearch={onSearch} onPick={onPick} results={results} busy={busy} />

        {notice && <p className="notice" role="alert">{notice}</p>}

        <PasteBox onSubmit={onPaste} />
        <SettingsPanel settings={settings} pack={pack} onChange={setSettings} />

        {view && dict ? (
          <>
            {/* The toggle shows the DESIRED language (immediate feedback on
                tap); the lyric below it shows the pack that actually
                annotated what you are reading. They converge within a tick,
                and `busy` keeps the control disabled until they do. */}
            <LangToggle
              value={pack.id}
              busy={packBusy || busy}
              onChange={(id) => void onLangChange(id)}
            />
            <LyricView
              lines={view.lines} dict={dict} engine={engine} settings={settings}
              pack={view.pack}
              activeLine={pstate.lineIndex} activeChar={pstate.charIndex}
              audioReady={audioReady}
              onPlayLine={(i) => player.playLine(view.lines[i], i)}
            />
          </>
        ) : (
          <div className="empty">
            <p className="empty-title">睇歌詞，學發音</p>
            <p>
              Search for a song above, or paste a lyric in. Every character gets its Cantonese or
              Mandarin reading — tap one to hear it and see what the word means.
            </p>
          </div>
        )}

        <Credits />
      </main>

      {/* Rendered outside <main> because it is fixed to the viewport, not to
          the document flow. */}
      {view && dict && (
        <Transport
          playing={pstate.playing}
          onPlayAll={() => player.playAll(view.lines)}
          onStop={() => player.stop()}
          gapSec={settings.interLineGapSec}
          onGapChange={(sec) => setSettings((s) => ({ ...s, interLineGapSec: sec }))}
        />
      )}
    </div>
  )
}
