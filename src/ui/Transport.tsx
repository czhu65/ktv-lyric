import { PlayIcon, StopIcon } from './icons'

interface Props {
  playing: boolean
  onPlayAll(): void
  onStop(): void
  /** Shown alongside the button so you know what is loaded once scrolled away. */
  label?: string
  gapSec: number
  onGapChange(sec: number): void
}

/**
 * Pinned to the bottom at every breakpoint. During playback this is the only
 * control that matters, and on a phone it has to be reachable one-handed.
 * The inter-line gap lives here rather than in Settings because it is the one
 * setting you actually adjust while listening.
 */
export default function Transport(
  { playing, onPlayAll, onStop, label, gapSec, onGapChange }: Props,
) {
  return (
    <div className="transport">
      <div className="transport-inner">
        {playing ? (
          <button type="button" className="btn btn-primary" onClick={onStop}>
            <StopIcon /> Stop
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onPlayAll}>
            <PlayIcon /> Play all
          </button>
        )}

        {label && <span className="song-meta">{label}</span>}

        <label className="transport-gap">
          <span className="sr-only">Gap between lines, in seconds</span>
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={gapSec}
            onChange={(e) => onGapChange(Number(e.target.value))}
          />
          <span className="transport-gap-value">{gapSec.toFixed(1)}s</span>
        </label>
      </div>
    </div>
  )
}
