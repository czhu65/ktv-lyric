import type { Token } from '../types'

export default function GlossPopover(
  { token, gloss, romanization, onClose }:
  { token: Token; gloss: string | null; romanization: string; onClose(): void },
) {
  return (
    <div className="gloss" role="dialog" aria-label="Definition">
      <button className="gloss-close" onClick={onClose} aria-label="Close">×</button>
      {/* Auto-focus is the wrong fix: the popover opens on EVERY character
          tap, so grabbing focus would repeatedly yank a screen-reader user
          out of the lyric. Announce instead -- focus stays put, and this
          live region is what tells assistive tech a definition appeared. */}
      <div aria-live="polite" aria-atomic="true">
        <div className="gloss-word">{token.chars.map((c) => c.char).join('')}</div>
        <div className="gloss-rom">{romanization}</div>
        <div className="gloss-def">{gloss ?? 'No definition available'}</div>
      </div>
    </div>
  )
}
