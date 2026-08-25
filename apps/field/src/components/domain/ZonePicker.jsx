/**
 * ZonePicker — saludo + zona en una sola línea compacta.
 * Sin barra blanca. Tap en zona → bottom sheet.
 * Inspirado en field apps 2026: glanceable, thumb-friendly, zero chrome.
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
  const first = nombre ? String(nombre).split(' ')[0] : ''
  const zonaLabel = subtitulo || theme.label || zonaActiva || '—'

  return (
    <>
      <header className="bs-topbar">
        <div className="bs-topbar-inner">
          <div className="bs-topbar-left">
            <span className="bs-topbar-hello">{first ? `Hola, ${first}` : 'Hola'}</span>
            {multi ? (
              <button
                type="button"
                className="bs-topbar-zone"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
              >
                <i className="bs-topbar-dot" aria-hidden="true" />
                <span>{zonaLabel}</span>
                <span className="bs-topbar-caret" aria-hidden="true">▾</span>
              </button>
            ) : (
              <span className="bs-topbar-zone is-static">
                <i className="bs-topbar-dot" aria-hidden="true" />
                {zonaLabel}
              </span>
            )}
          </div>
        </div>
      </header>

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
    </>
  )
}

export default ZonePicker
