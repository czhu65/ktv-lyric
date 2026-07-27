import type { LangId } from '../lang/types'

const OPTIONS: { id: LangId; label: string; sub: string }[] = [
  { id: 'yue', label: '粵語', sub: 'Jyutping' },
  { id: 'cmn', label: '普通話', sub: 'Pinyin' },
]

/**
 * Which reading the lyric is annotated with.
 *
 * This is a per-song choice, not a global setting: the same user sings both,
 * and the initial position is only a GUESS derived from iTunes genre
 * metadata. It sits directly above the lyric because a wrong guess must be
 * obvious and one tap from being fixed -- that visibility is what makes
 * guessing acceptable at all.
 */
export default function LangToggle(
  { value, busy, onChange }: { value: LangId; busy: boolean; onChange(id: LangId): void },
) {
  return (
    <div className="setting lang-toggle">
      <span className="setting-label" id="lang-toggle-label">Reading</span>
      <div className="segmented" role="group" aria-labelledby="lang-toggle-label">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            aria-pressed={value === o.id}
            // Re-selecting the active language would pointlessly re-annotate
            // every line, so it is a no-op rather than a cheap-looking event.
            onClick={() => { if (value !== o.id) onChange(o.id) }}
          >
            {o.label}<span className="lang-sub">{o.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
