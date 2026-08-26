/**
 * AppHeader — una sola franja superior para toda la app.
 *
 * QUÉ REEMPLAZA
 * -------------
 * Antes había DOS encabezados apilados: una franja blanca con el saludo
 * y el selector de zona, y debajo el hero oscuro de cada página con su
 * propio título. Resultado: ~180px de alto sin una sola acción, y el
 * saludo repetido dos veces.
 *
 * Ahora: un header que se colapsa al hacer scroll. Arriba del todo va
 * información pura (saludo, zona) porque el tercio superior de un
 * teléfono es zona de estiramiento — nunca acciones críticas.
 *
 * COMPORTAMIENTO
 * · Estado expandido: saludo + título + subtítulo + segmented de zona.
 * · Al bajar más de 40px: colapsa a 52px dejando sólo título y zona.
 * · La transición es de 200ms, dentro del rango 150–300ms recomendado.
 * · El colapso usa max-height + opacity (compositable), no display:none,
 *   para que no salte el layout.
 * · position: sticky, no fixed: no tapa contenido al final de la lista.
 */
import { useEffect, useRef, useState } from 'react'
import { ZoneSegmented } from './ZoneSegmented.jsx'

export function AppHeader({
  eyebrow,
  titulo,
  subtitulo,
  nombre,
  zonas = [],
  zonaActiva,
  onZonaChange,
  tono = 'dark',
  extra = null,
}) {
  const [compacto, setCompacto] = useState(false)
  const ticking = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      // rAF: el handler corre una vez por frame, no por evento.
      requestAnimationFrame(() => {
        const y = window.scrollY || document.documentElement.scrollTop
        // Histéresis: expande a 24 y colapsa a 56. Sin esto, parpadea
        // cuando el usuario queda justo en el umbral.
        setCompacto((prev) => (prev ? y > 24 : y > 56))
        ticking.current = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const saludo = nombre ? String(nombre).split(' ')[0] : null

  return (
    <header
      className={
        'bs-appheader' +
        (compacto ? ' is-compact' : '') +
        (tono === 'light' ? ' is-light' : '')
      }
    >
      <div className="bs-appheader-inner">
        <div className="bs-appheader-main">
          {eyebrow && <p className="bs-appheader-eyebrow">{eyebrow}</p>}
          <h1 className="bs-appheader-title">{titulo}</h1>
          {subtitulo && <p className="bs-appheader-sub">{subtitulo}</p>}
          {saludo && (
            <p className="bs-appheader-hola">Hola, {saludo}</p>
          )}
        </div>

        {zonas.length > 1 && (
          <div className="bs-appheader-zone">
            <ZoneSegmented
              zonas={zonas}
              zonaActiva={zonaActiva}
              onChange={onZonaChange}
            />
          </div>
        )}

        {extra && <div className="bs-appheader-extra">{extra}</div>}
      </div>
    </header>
  )
}

export default AppHeader
