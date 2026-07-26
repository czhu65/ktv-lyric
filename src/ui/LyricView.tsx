import { useState } from 'react'
import type { Line, Token } from '../types'
import type { Dict } from '../dict'
import type { AudioEngine } from '../audio'
import type { Settings } from '../storage'
import { toYale } from '../romanize/yale'
import GlossPopover from './GlossPopover'
import './lyric.css'

interface Props {
  lines: Line[]
  dict: Dict
  engine: AudioEngine
  settings: Settings
  activeLine: number
  activeChar: number
  onPlayLine(lineIndex: number): void
}

export default function LyricView(
  { lines, dict, engine, settings, activeLine, activeChar, onPlayLine }: Props,
) {
  const [selected, setSelected] = useState<Token | null>(null)
  const show = (s: string) => (settings.romanization === 'yale' ? toYale(s) : s)

  // ONE gesture, TWO outcomes: audio fires immediately and is never gated on
  // the popover. The gloss is for the enclosing token, not the character.
  async function onTap(token: Token, syllables: string[]) {
    setSelected(token)
    await engine.unlock()
    for (const s of syllables) {
      await engine.load(s)
      engine.play(s)
    }
  }

  return (
    <div className={`lyric ruby-${settings.rubyPosition}`}>
      {lines.map((line, li) => (
        <p className="lyric-line" key={li}>
          <button
            className="play-line"
            onClick={() => onPlayLine(li)}
            aria-label={`Play line ${li + 1}`}
          >
            ▶
          </button>
          {line.tokens.map((token, ti) => (
            <span className="token" key={ti} data-word={token.chars.length > 1 || undefined}>
              {token.chars.map((ch, ci) => {
                const idx = line.tokens.slice(0, ti).reduce((n, t) => n + t.chars.length, 0) + ci
                if (ch.syllables.length === 0) {
                  return <span className="punct" key={ci}>{ch.char}</span>
                }
                // The Task 3 build guard should make this unreachable, but a
                // silent character is worse than a marked one.
                const noAudio = ch.syllables.some((s) => !engine.has(s))
                return (
                  <button
                    key={ci}
                    className="char"
                    data-active={li === activeLine && idx === activeChar ? 'true' : undefined}
                    data-noaudio={noAudio ? 'true' : undefined}
                    title={noAudio ? `No audio for ${ch.syllables.join(' ')}` : undefined}
                    onClick={() => onTap(token, ch.syllables)}
                  >
                    {/* No whitespace between ruby elements — browsers insert stray spaces. */}
                    <ruby>{ch.char}<rt>{ch.syllables.map(show).join(' ')}</rt></ruby>
                  </button>
                )
              })}
            </span>
          ))}
        </p>
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
