export default function Transport(
  { playing, onPlayAll, onStop }: { playing: boolean; onPlayAll(): void; onStop(): void },
) {
  return (
    <div className="transport">
      {playing
        ? <button onClick={onStop}>■ Stop</button>
        : <button onClick={onPlayAll}>▶ Play all</button>}
    </div>
  )
}
