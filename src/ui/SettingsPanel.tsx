import type { Settings } from '../storage'
import { SettingsIcon } from './icons'

/**
 * Settings that you set once and forget. The inter-line gap deliberately does
 * NOT live here — it belongs in the transport, because it is the one control
 * you reach for mid-listen.
 */
export default function SettingsPanel(
  { settings, onChange }: { settings: Settings; onChange(s: Settings): void },
) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <details className="panel settings">
      <summary>
        <SettingsIcon />
        Display settings
      </summary>
      <div className="panel-body">
        <fieldset className="settings-grid">
          <legend className="sr-only">Display settings</legend>

          <div className="setting">
            <label className="setting-label" htmlFor="set-romanization">
              Romanization
            </label>
            <select
              id="set-romanization"
              value={settings.romanization}
              onChange={(e) => set('romanization', e.target.value as Settings['romanization'])}
            >
              <option value="jyutping">Jyutping — tone numbers (ngo5)</option>
              <option value="yale">Yale — tone marks (ngóh)</option>
            </select>
          </div>

          <div className="setting">
            <span className="setting-label" id="set-ruby-label">Annotation position</span>
            <div className="segmented" role="group" aria-labelledby="set-ruby-label">
              <button
                type="button"
                aria-pressed={settings.rubyPosition === 'over'}
                onClick={() => set('rubyPosition', 'over')}
              >
                Above
              </button>
              <button
                type="button"
                aria-pressed={settings.rubyPosition === 'under'}
                onClick={() => set('rubyPosition', 'under')}
              >
                Below
              </button>
            </div>
          </div>

          <div className="setting">
            <span className="setting-label" id="set-theme-label">Theme</span>
            <div className="segmented" role="group" aria-labelledby="set-theme-label">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={settings.theme === t}
                  onClick={() => set('theme', t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>
    </details>
  )
}
