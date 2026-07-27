import type { LanguagePack } from '../lang/types'
import { renderSyllable } from '../lang'
import type { Settings } from '../storage'
import type { Syllable } from '../types'

// Shared by LyricView (the popover's romanization row) and LyricLine (each
// character's ruby annotation) -- both need the exact same "which
// romanization does the user want to see" decision.
//
// The style is chosen PER LANGUAGE (Settings.romanization is keyed by LangId),
// so this needs the pack to know which half of that setting applies, and
// renderSyllable handles a stale style id by falling back to the pack's first.
export function showRomanization(
  s: Syllable, pack: LanguagePack, settings: Settings,
): string {
  return renderSyllable(pack, settings.romanization[pack.id], s)
}
