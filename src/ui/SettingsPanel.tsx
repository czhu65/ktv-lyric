import type { LanguagePack } from '../lang/types'
import type { Settings } from '../storage'
import { SettingsIcon } from './icons'

/**
 * Settings that you set once and forget. The inter-line gap deliberately does
 * NOT live here — it belongs in the transport, because it is the one control
 * you reach for mid-listen.
 */
export default function SettingsPanel(
  { settings, pack, onChange }:
    { settings: Settings; pack: LanguagePack; onChange(s: Settings): void },
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
            {/* Options come from the ACTIVE pack, and the change writes only
                that language's slot -- so a Cantonese preference survives a
                trip through a Mandarin song and back. */}
            <select
              id="set-romanization"
              value={settings.romanization[pack.id]}
              onChange={(e) =>
                set('romanization', { ...settings.romanization, [pack.id]: e.target.value })
              }
            >
              {pack.romanizations.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
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
