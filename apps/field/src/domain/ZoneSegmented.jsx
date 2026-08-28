/**
 * ZoneSegmented — cambio de zona con TODAS las opciones visibles.
 *
 * POR QUÉ ESTO Y NO UN DESPLEGABLE
 * --------------------------------
 * El mapa de selección de componentes es explícito:
 *   2 opciones      → toggle
 *   3–5 opciones    → segmented control
 *   6+ opciones     → dropdown / tabs
 *
 * Hay TRES zonas. El desplegable de V9.3 fue un error mío: escondía
 * opciones que caben perfectamente en pantalla, y obligaba a dos toques
 * (abrir + elegir) para algo que debe costar uno.
 *
 * El segmented control es "visibility-first": su valor es que se vean
 * todas a la vez. Va en la barra superior, pegado al contenido que
 * controla, nunca abajo.
 *
 * DETALLES DE IMPLEMENTACIÓN
 * · Pastilla deslizante con transform (compositable, 60fps) en vez de
 *   animar left/width, que fuerza layout en cada frame.
 * · Área de toque real ≥ 44px aunque el control mida menos.
 * · Sólo cambia el color al seleccionar — pedido literal de Sebastián.
 * · Con una sola zona no se renderiza nada: un vendedor de terreno
 *   nunca ve un control inútil.
 * · Flechas ← → para teclado, roving tabindex (patrón WAI-ARIA de tabs).
 * · prefers-reduced-motion desactiva el deslizamiento, no lo ralentiza.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getZoneTheme, applyZoneCssVars } from '../lib/theme/zones'

/** Etiqueta corta: "NOR-ORIENTE" no entra tres veces en 360px. */
function corta(zona, theme) {
  if (theme?.short) return theme.short
  const z = String(zona || '').toUpperCase()
  // Etiquetas cortas: con tres pastillas visibles el contexto ya está
  // dado. "NOR-PONIENTE" completo obliga a truncar y se lee peor que
  // "Poniente".
  if (z.includes('ORIENTE')) return 'Oriente'
  if (z.includes('PONIENTE')) return 'Poniente'
  if (z.includes('SUR')) return 'Sur'
  return z.replace(/^ZONA\s+/, '')
}

export function ZoneSegmented({ zonas = [], zonaActiva, onChange }) {
  const wrapRef = useRef(null)
  const btnRefs = useRef([])
  const [thumb, setThumb] = useState(null)
  const [listo, setListo] = useState(false)

  const idx = Math.max(0, zonas.indexOf(zonaActiva))

  // Medir DESPUÉS del layout pero ANTES de pintar: sin salto visible.
  useLayoutEffect(() => {
    const el = btnRefs.current[idx]
    const wrap = wrapRef.current
    if (!el || !wrap) return
    setThumb({ x: el.offsetLeft, w: el.offsetWidth })
    // El primer posicionamiento no se anima (si no, la pastilla "vuela"
    // desde 0 al montar).
    const t = setTimeout(() => setListo(true), 40)
    return () => clearTimeout(t)
  }, [idx, zonas.length])

  // Re-medir si cambia el ancho del contenedor (rotación, teclado).
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const el = btnRefs.current[idx]
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth })
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [idx])

  // El color de zona se publica en :root para acentos, mapa y headers.
  useEffect(() => {
    if (zonaActiva) applyZoneCssVars(zonaActiva)
  }, [zonaActiva])

  const pick = useCallback((z) => {
    if (z === zonaActiva) return
    // Háptica sólo en cambio de contexto real, no en cada toque.
    if (navigator.vibrate) navigator.vibrate(8)
    onChange?.(z)
  }, [zonaActiva, onChange])

  const onKey = useCallback((e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = (idx + d + zonas.length) % zonas.length
    btnRefs.current[next]?.focus()
    pick(zonas[next])
  }, [idx, zonas, pick])

  if (zonas.length < 2) return null

  const theme = getZoneTheme(zonaActiva)

  return (
    <div
      className="bs-seg"
      ref={wrapRef}
      role="tablist"
      aria-label="Zona comercial"
      onKeyDown={onKey}
      style={{ '--seg-active': theme.chip, '--seg-active-soft': theme.soft }}
    >
      {thumb && (
        <span
          className={'bs-seg-thumb' + (listo ? ' is-ready' : '')}
          aria-hidden="true"
          style={{
            transform: `translateX(${thumb.x}px)`,
            width: thumb.w,
            // La pastilla se pinta del color de la zona: el ejecutivo
            // reconoce dónde está por color, no sólo por posición.
            background: getZoneTheme(zonas[idx])?.chip,
          }}
        />
      )}

      {zonas.map((z, i) => {
        const t = getZoneTheme(z)
        const activo = i === idx
        return (
          <button
            key={z}
            ref={(el) => (btnRefs.current[i] = el)}
            type="button"
            role="tab"
            aria-selected={activo}
            tabIndex={activo ? 0 : -1}
            className={'bs-seg-btn' + (activo ? ' is-active' : '')}
            style={activo ? { color: '#fff' } : undefined}
            onClick={() => pick(z)}
          >
            {corta(z, t)}
          </button>
        )
      })}
    </div>
  )
}

export default ZoneSegmented
