/**
 * ZonePicker — el color del nombre de zona indica selección.
 * Sin pastilla blanca/naranja a la derecha (pedido UX).
 * Tap en la zona abre sheet para cambiar.
 */
import { useEffect, useState, useCallback } from 'react'
import { getZoneTheme, applyZoneCssVars } from '../../lib/theme/zones'

export function ZonePicker({ nombre, zonaActiva, zonas = [], onChange, subtitulo }) {
  const [open, setOpen] = useState(false)
  const theme = getZoneTheme(zonaActiva)

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
  const saludo = nombre ? `Hola, ${String(nombre).split(' ')[0]}` : 'Hola'
  const zonaLabel = subtitulo || theme.label || zonaActiva || '—'

  return (
    <>
      <div className="bs-greet bs-greet--clean">
        <div className="bs-greet-text">
          <p className="bs-greet-hello">{saludo}</p>
          {multi ? (
            <button
              type="button"
              className="bs-greet-zone-btn"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`Zona ${zonaLabel}. Cambiar`}
            >
              <span className="bs-greet-zone-dot" aria-hidden="true" />
              <span className="bs-greet-zone-name">{zonaLabel}</span>
              <span className="bs-greet-zone-caret" aria-hidden="true">▾</span>
            </button>
          ) : (
            <p className="bs-greet-zone">
              <span className="bs-greet-zone-dot" aria-hidden="true" />
              {zonaLabel}
            </p>
          )}
        </div>
      </div>

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
            <p className="bs-zone-sheet-title">Cambiar zona</p>
            {(zonas || []).map((z) => {
              const t = getZoneTheme(z)
              const active = z === zonaActiva
              return (
                <button
                  key={z}
                  type="button"
                  className={'bs-zone-option' + (active ? ' is-active' : '')}
                  style={{ '--zone-opt': t.chip || t.color || '#c2410c', '--zone-opt-soft': t.soft || '#fff7ed' }}
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
    </>
  )
}

export default ZonePicker
