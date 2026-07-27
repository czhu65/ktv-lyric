import type { Settings } from '../storage'
import { toYale } from './yale'

// Shared by LyricView (the popover's romanization row) and LyricLine (each
// character's ruby annotation) -- both need the exact same "which
// romanization does the user want to see" decision, and it used to be
// copy-pasted identically in both files.
export function showRomanization(s: string, romanization: Settings['romanization']): string {
  return romanization.yue === 'yale' ? toYale(s) : s
}
