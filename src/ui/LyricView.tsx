import { useCallback, useState } from 'react'
import type { Line, Token } from '../types'
import type { Dict } from '../dict'
import type { AudioEngine } from '../audio'
import type { Settings } from '../storage'
import type { LanguagePack } from '../lang/types'
import { showRomanization } from '../romanize/show'
import GlossPopover from './GlossPopover'
import LyricLine from './LyricLine'
import './lyric.css'

interface Props {
  lines: Line[]
  dict: Dict
  engine: AudioEngine
  settings: Settings
  pack: LanguagePack
  activeLine: number
  activeChar: number
  /** True once the audio manifest has loaded. Defaults to true so callers
   *  (and every existing test) that don't care about the loading window
   *  keep the old, always-settled behaviour -- see Finding 2. */
  audioReady?: boolean
  onPlayLine(lineIndex: number): void
}

export default function LyricView(
  { lines, dict, engine, settings, pack, activeLine, activeChar, audioReady = true, onPlayLine }: Props,
) {
  const [selected, setSelected] = useState<Token | null>(null)
  const show = (s: string) => showRomanization(s, pack, settings)

  // ONE gesture, TWO outcomes: audio fires immediately and is never gated on
  // the popover. The gloss is for the enclosing token, not the character.
  // useCallback keeps this reference stable across renders -- an inline
  // arrow recreated every render would defeat LyricLine's React.memo for
  // every line, not just the active one.
  const onTapChar = useCallback(async (token: Token, syllables: string[]) => {
    setSelected(token)
    await engine.unlock()
    await engine.prefetch(syllables)
    // Schedules back-to-back instead of all-at-once, so a multi-syllable
    // character doesn't play its syllables overlapping each other.
    engine.playSequence(syllables)
  }, [engine])

  return (
    <div className={`lyric ruby-${settings.rubyPosition}`}>
      {lines.map((line, li) => (
        <LyricLine
          key={li}
          line={line}
          lineIndex={li}
          engine={engine}
          settings={settings}
          pack={pack}
          audioReady={audioReady}
          activeCharInThisLine={li === activeLine ? activeChar : null}
          onPlayLine={onPlayLine}
          onTapChar={onTapChar}
        />
      ))}

      {selected && (
        <GlossPopover
          token={selected}
          gloss={dict.lookup(selected.chars.map((c) => c.char).join(''))}
          romanization={selected.chars.flatMap((c) => c.syllables).map(show).join(' ')}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
