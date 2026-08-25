/**
 * ZonePicker — selección de zona DENTRO del saludo del header.
 *
 * Reemplaza a ZoneTabs (barra de 3 pills fijas que consumía ~60px
 * verticales en TODAS las pantallas del teléfono).
 *
 * Pedido literal: "la selección de las zonas iba a ser con el mismo
 * donde dice hola Sebastián, lo que cambiaba eran los colores solamente
 * cuando se selecciona".
 *
 * Con 1 zona no se renderiza control alguno — un vendedor de terreno
 * nunca ve un selector inútil; sólo el gerente multi-zona lo ve.
 */
import { useEffect, useState, useCallback } from 'react'
import { getZoneTheme, applyZoneCssVars } from '../../lib/theme/zones'

function IconCaret() {
  return (
    <svg className="bs-zone-picker-caret" width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/**
 * @param {{
 *   nombre?: string,
 *   zonaActiva: string,
 *   zonas?: string[],
 *   onChange: (z: string) => void,
 *   subtitulo?: string
 * }} props
 */
export function ZonePicker({ nombre, zonaActiva, zonas = [], onChange, subtitulo }) {
  const [open, setOpen] = useState(false)
  const theme = getZoneTheme(zonaActiva)

  // El color activo se publica en :root — headers, mapas y acentos siguen.
  useEffect(() => {
    if (zonaActiva) applyZoneCssVars(zonaActiva)
  }, [zonaActiva])

  // Cerrar con Escape
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

  const multi = zonas.length > 1
  const saludo = nombre ? `Hola, ${String(nombre).split(' ')[0]}` : 'Hola'

  return (
    <>
      <div className="bs-greet">
        <div className="bs-greet-text">
          <p className="bs-greet-hello">{saludo}</p>
          <p className="bs-greet-zone">{subtitulo || theme.label || zonaActiva}</p>
        </div>

        {multi && (
          <button
            type="button"
            className="bs-zone-picker"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`Zona actual: ${theme.label}. Cambiar zona`}
          >
            <span className="bs-zone-picker-label">{theme.short || theme.label}</span>
            <IconCaret />
          </button>
        )}
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
            <p className="bs-zone-sheet-title">Ver zona</p>
            {zonas.map((z) => {
              const t = getZoneTheme(z)
              const active = z === zonaActiva
              return (
                <button
                  key={z}
                  type="button"
                  className={'bs-zone-option' + (active ? ' is-active' : '')}
                  style={{ '--zone-opt': t.chip, '--zone-opt-soft': t.soft }}
                  onClick={() => pick(z)}
                  aria-current={active}
                >
                  <span className="bs-zone-option-dot" aria-hidden="true" />
                  <span>{t.label || z}</span>
                  {active && <span className="bs-zone-option-check" aria-hidden="true">✓</span>}
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
