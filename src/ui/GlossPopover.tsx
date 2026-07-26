import type { Token } from '../types'

export default function GlossPopover(
  { token, gloss, romanization, onClose }:
  { token: Token; gloss: string | null; romanization: string; onClose(): void },
) {
  return (
    <div className="gloss" role="dialog" aria-label="Definition">
      <button className="gloss-close" onClick={onClose} aria-label="Close">×</button>
      <div className="gloss-word">{token.chars.map((c) => c.char).join('')}</div>
      <div className="gloss-rom">{romanization}</div>
      <div className="gloss-def">{gloss ?? 'No definition available'}</div>
    </div>
  )
}
