/**
 * Zone system — sin barra blanca global.
 * - ZoneProvider: monta el bottom-sheet (una sola vez en App)
 * - ZoneChip: control inline para héroes (color de zona, tap → sheet)
 *
 * Root fix: el saludo y la zona viven DENTRO del hero de cada pantalla,
 * no en una franja separada encima de todo.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getZoneTheme, applyZoneCssVars } from '../../lib/theme/zones'

const ZoneCtx = createContext(null)

export function useZoneUi() {
  return useContext(ZoneCtx)
}

export function ZoneProvider({ zonaActiva, zonas = [], onChange, children }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (zonaActiva) applyZoneCssVars(zonaActiva)
  }, [zonaActiva])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const pick = useCallback((z) => {
    setOpen(false)
    if (z !== zonaActiva) onChange?.(z)
  }, [zonaActiva, onChange])

  const multi = (zonas || []).length > 1
  const theme = getZoneTheme(zonaActiva)

  const value = useMemo(() => ({
    zonaActiva,
    zonas,
    multi,
    theme,
    openSheet: () => multi && setOpen(true),
    label: theme.label || zonaActiva || '—',
  }), [zonaActiva, zonas, multi, theme])

  return (
    <ZoneCtx.Provider value={value}>
      {children}
      {open && multi && (
        <div
          className="bs-zone-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Elegir zona"
          onClick={() => setOpen(false)}
        >
          <div className="bs-zone-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bs-zone-sheet-handle" />
            <p className="bs-zone-sheet-title">Tu zona</p>
            {(zonas || []).map((z) => {
              const t = getZoneTheme(z)
              const active = z === zonaActiva
              return (
                <button
                  key={z}
                  type="button"
                  className={'bs-zone-option' + (active ? ' is-active' : '')}
                  style={{
                    '--zone-opt': t.chip || t.color || '#c2410c',
                    '--zone-opt-soft': t.soft || '#fff7ed',
                  }}
                  onClick={() => pick(z)}
                  aria-current={active}
                >
                  <span className="bs-zone-option-dot" aria-hidden="true" />
                  <span className="bs-zone-option-label">{t.label || z}</span>
                  {active && <span className="bs-zone-option-check">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </ZoneCtx.Provider>
  )
}

/** Chip inline para poner dentro de héroes oscuros o claros */
export function ZoneChip({ light = false }) {
  const ctx = useZoneUi()
  if (!ctx) return null
  const { label, multi, openSheet } = ctx
  if (multi) {
    return (
      <button
        type="button"
        className={'bs-zone-chip' + (light ? ' is-light' : '')}
        onClick={openSheet}
        aria-label={`Zona ${label}. Cambiar`}
      >
        <i className="bs-zone-chip-dot" aria-hidden="true" />
        <span>{label}</span>
        <span className="bs-zone-chip-caret" aria-hidden="true">▾</span>
      </button>
    )
  }
  return (
    <span className={'bs-zone-chip is-static' + (light ? ' is-light' : '')}>
      <i className="bs-zone-chip-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

/** Compat: ZonePicker ya no pinta barra. Solo provider. */
export function ZonePicker({ nombre, zonaActiva, zonas = [], onChange, children }) {
  return (
    <ZoneProvider zonaActiva={zonaActiva} zonas={zonas} onChange={onChange}>
      {children}
    </ZoneProvider>
  )
}

export default ZonePicker
