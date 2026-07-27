import { useState } from 'react'

export default function PasteBox({ onSubmit }: { onSubmit(text: string): void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  if (!open) {
    return <button onClick={() => setOpen(true)}>Paste lyrics manually</button>
  }
  return (
    <div className="paste">
      <label htmlFor="paste-area">Paste the lyrics (LRC timestamps are fine)</label>
      <textarea id="paste-area" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => onSubmit(text)} disabled={!text.trim()}>Use these lyrics</button>
    </div>
  )
}
