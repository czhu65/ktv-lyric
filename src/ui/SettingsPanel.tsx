import type { Settings } from '../storage'

export default function SettingsPanel(
  { settings, onChange }: { settings: Settings; onChange(s: Settings): void },
) {
  return (
    <fieldset className="settings">
      <legend>Settings</legend>

      <label>
        Gap between lines: {settings.interLineGapSec.toFixed(1)}s
        <input
          type="range" min={0} max={5} step={0.1}
          value={settings.interLineGapSec}
          onChange={(e) => onChange({ ...settings, interLineGapSec: Number(e.target.value) })}
        />
      </label>

      <label>
        Romanization
        <select
          value={settings.romanization}
          onChange={(e) =>
            onChange({ ...settings, romanization: e.target.value as Settings['romanization'] })}
        >
          <option value="jyutping">Jyutping</option>
          <option value="yale">Yale</option>
        </select>
      </label>

      <label>
        Ruby position
        <select
          value={settings.rubyPosition}
          onChange={(e) =>
            onChange({ ...settings, rubyPosition: e.target.value as Settings['rubyPosition'] })}
        >
          <option value="over">Above the character</option>
          <option value="under">Below the character</option>
        </select>
      </label>
    </fieldset>
  )
}
