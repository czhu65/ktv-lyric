import { useState } from 'react'
import { PasteIcon } from './icons'

/**
 * The paste path is a first-class tier, not a fallback for failure: the lyric
 * API misses a substantial share of newer Hong Kong material, so it is always
 * available rather than appearing only after a search comes up empty.
 */
export default function PasteBox({ onSubmit }: { onSubmit(text: string): void }) {
  const [text, setText] = useState('')

  return (
    <details className="panel paste">
      <summary>
        <PasteIcon />
        Paste lyrics manually
      </summary>
      <div className="panel-body">
        <label htmlFor="paste-area">
          Paste any lyric text — <code>[mm:ss.xx]</code> timestamps are fine, and both
          Traditional and Simplified Chinese are accepted.
        </label>
        <textarea
          id="paste-area"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSubmit(text)}
            disabled={!text.trim()}
          >
            Use these lyrics
          </button>
        </div>
      </div>
    </details>
  )
}
