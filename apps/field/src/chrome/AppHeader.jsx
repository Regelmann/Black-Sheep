/**
 * AppHeader — una sola franja superior para toda la app.
 * V14 añade una capa de intención global (⌘K / Ctrl+K).
 */
import { useEffect, useRef, useState } from 'react'
import { ZoneSegmented } from '../domain/ZoneSegmented.jsx'
import CommandLayer from './CommandLayer.jsx'

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
      requestAnimationFrame(() => {
        const y = window.scrollY || document.documentElement.scrollTop
        setCompacto(prev => (prev ? y > 24 : y > 56))
        ticking.current = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return <header className={`bs-appheader${compacto ? ' is-compact' : ''}${tono === 'light' ? ' is-light' : ''}`}>
    <div className="bs-appheader-inner">
      <div className="bs-appheader-main">
        {eyebrow && <p className="bs-appheader-eyebrow">{eyebrow}</p>}
        <h1 className="bs-appheader-title">{titulo}</h1>
        {subtitulo && <p className="bs-appheader-sub">{subtitulo}</p>}
      </div>
      <div className="bs-appheader-tools">
        <CommandLayer />
        {zonas.length > 1 && <div className="bs-appheader-zone"><ZoneSegmented zonas={zonas} zonaActiva={zonaActiva} onChange={onZonaChange} /></div>}
        {extra && <div className="bs-appheader-extra">{extra}</div>}
      </div>
    </div>
  </header>
}

export default AppHeader
