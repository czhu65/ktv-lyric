import { memo } from 'react'
import type { Line, Token } from '../types'
import type { AudioEngine } from '../audio'
import type { Settings } from '../storage'
import { toYale } from '../romanize/yale'

export interface LyricLineProps {
  line: Line
  lineIndex: number
  engine: AudioEngine
  settings: Settings
  /** The active character's flat index within THIS line, or null if this
   *  line isn't the active one. Scoping it this way (instead of passing the
   *  raw activeLine/activeChar pair down to every line) is what lets
   *  React.memo actually bail out for every line except the active one. */
  activeCharInThisLine: number | null
  onPlayLine(lineIndex: number): void
  onTapChar(token: Token, syllables: string[]): void
}

// Test-only instrumentation: counts real invocations of the function below
// (not the memo wrapper). A tick that changes activeChar in a DIFFERENT
// line must leave this unchanged for lines whose props didn't change --
// that's the property src/ui/LyricView.test.tsx exercises. One integer
// increment per real render; irrelevant in production.
export let renderCount = 0
export function resetRenderCount(): void {
  renderCount = 0
}

function LyricLineImpl(
  { line, lineIndex, engine, settings, activeCharInThisLine, onPlayLine, onTapChar }: LyricLineProps,
) {
  renderCount++
  const show = (s: string) => (settings.romanization === 'yale' ? toYale(s) : s)

  let idx = 0 // accumulated across tokens/chars as we map, not re-sliced+reduced per character
  return (
    <p className="lyric-line">
      <button
        className="play-line"
        onClick={() => onPlayLine(lineIndex)}
        aria-label={`Play line ${lineIndex + 1}`}
      >
        ▶
      </button>
      {line.tokens.map((token, ti) => (
        <span className="token" key={ti} data-word={token.chars.length > 1 || undefined}>
          {token.chars.map((ch, ci) => {
            const charIdx = idx
            idx += 1
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
                data-active={activeCharInThisLine === charIdx ? 'true' : undefined}
                data-noaudio={noAudio ? 'true' : undefined}
                title={noAudio ? `No audio for ${ch.syllables.join(' ')}` : undefined}
                onClick={() => onTapChar(token, ch.syllables)}
              >
                {/* No whitespace between ruby elements — browsers insert stray spaces. */}
                <ruby>{ch.char}<rt>{ch.syllables.map(show).join(' ')}</rt></ruby>
              </button>
            )
          })}
        </span>
      ))}
    </p>
  )
}

// React.memo is the whole point: a tick changes activeChar for exactly one
// line, so every OTHER line's props are unchanged and must bail out here
// instead of re-diffing every character button in the lyric.
const LyricLine = memo(LyricLineImpl)
export default LyricLine
