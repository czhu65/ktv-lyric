import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchSongs, fetchLyrics, RateLimitError } from './search'
import { parseLyricText } from './lyrics/parse'
import { normalize, isSimplified, toTraditional } from './script'
import { annotateLine } from './annotate'
import { loadDict, type Dict } from './dict'
import { createAudioEngine } from './audio'
import { createPlayer, type PlayerState } from './player'
import { loadSettings, saveSettings, type Settings } from './storage'
import type { Line, SongCandidate } from './types'
import SearchBar from './ui/SearchBar'
import PasteBox from './ui/PasteBox'
import Transport from './ui/Transport'
import SettingsPanel from './ui/SettingsPanel'
import LyricView from './ui/LyricView'

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
  const player = useRef(
    createPlayer({
      engine,
      now: () => ctx.currentTime,
      // setTimeout, NEVER setInterval.
      schedule: (fn, ms) => void setTimeout(fn, ms),
    }),
  ).current

  useEffect(() => { loadDict().then(setDict).catch(() => setNotice('Dictionary failed to load')) }, [])
  useEffect(() => player.subscribe(setPstate), [player])
  useEffect(() => {
    saveSettings(settings)
    player.setInterLineGap(settings.interLineGapSec)
  }, [settings, player])

  const annotate = useCallback(async (raw: { text: string; timeMs?: number }[]) => {
    if (!dict) return
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
    setLines(out)
  }, [dict])

  const onSearch = useCallback(async (q: string) => {
    setBusy(true); setNotice(null)
    try {
      setResults(await searchSongs(q))
    } catch {
      setNotice('Search is unavailable. You can paste the lyrics instead.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onPick = useCallback(async (c: SongCandidate) => {
    setBusy(true); setNotice(null)
    try {
      const raw = await fetchLyrics(c)
      if (!raw) setNotice('No lyrics found for that track. Paste them below to continue.')
      else await annotate(raw)
    } catch (e) {
      setNotice(
        e instanceof RateLimitError
          ? `Rate limited by LRCLIB — retry in ${e.retryAfterSec}s, or paste the lyrics below.`
          : 'Lyric lookup failed. Paste the lyrics below to continue.',
      )
    } finally {
      setBusy(false)
    }
  }, [annotate])

  return (
    <main>
      <h1>KTV Lyric</h1>
      <SearchBar onSearch={onSearch} onPick={onPick} results={results} busy={busy} />
      {notice && <p role="alert">{notice}</p>}
      <PasteBox onSubmit={(t) => annotate(parseLyricText(t))} />
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
    </main>
  )
}
