/**
 * ZoneTabs — selector de zona production-ready.
 * Colores desde lib/theme/zones (nunca se pierden).
 */
import { useEffect } from 'react'
import {
  getZoneTheme,
  zoneCssVars,
  applyZoneCssVars,
  ZONE_ORDER,
} from '../../lib/theme/zones'

/**
 * @param {{
 *   zones?: string[],
 *   activeZone: string,
 *   onChange: (z: string) => void,
 *   isLoading?: boolean,
 *   showDot?: boolean,
 * }} props
 */
export function ZoneTabs({
  zones = [],
  activeZone,
  onChange,
  isLoading = false,
  showDot = true,
}) {
  useEffect(() => {
    if (activeZone) applyZoneCssVars(activeZone)
  }, [activeZone])

  const list =
    zones.length > 0
      ? zones
      : ZONE_ORDER

  if (!list.length) return null

  return (
    <div className="kf-zone-bar bs-zone-tabs" role="tablist" aria-label="Zonas de terreno">
      {list.map((zone) => {
        const theme = getZoneTheme(zone)
        const isActive = zone === activeZone
        const slug = String(zone).replace(/\s+/g, '-')

        return (
          <button
            key={zone}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`zone-panel-${slug}`}
            id={`zone-tab-${slug}`}
            disabled={isLoading}
            className={'kf-zone-btn bs-zone-tab' + (isActive ? ' is-active' : '')}
            style={zoneCssVars(theme)}
            onClick={() => {
              if (zone !== activeZone) onChange?.(zone)
            }}
          >
            {showDot && (
              <span
                className="bs-zone-tab-dot"
                aria-hidden="true"
                style={{
                  background: isActive ? 'var(--zone-on-chip)' : 'var(--zone-chip)',
                }}
              />
            )}
            <span className="bs-zone-tab-label">{theme.label || zone}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ZoneTabs
