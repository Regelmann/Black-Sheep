// Componentes compartidos: navegación inferior (4 tabs + Más) y helpers
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'

export const money = n => {
  const v = Number(n)
  return isNaN(v) ? '$0' : '$' + v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

export function pctNum(x) {
  const p = Number(x)
  if (isNaN(p)) return 0
  return p <= 1.5 ? Math.round(p * 100) : Math.round(p)
}

const ICON = {
  hoy: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  mapa: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  clientes: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8z',
  mas: 'M4 6h16M4 12h16M4 18h16',
  stock: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  gerencia: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  admin: 'M12 15.5A3.5 3.5 0 1012 8.5a3.5 3.5 0 000 7zm7.43-2.24l1.4-2.42-1.4-2.42a7.94 7.94 0 00-.74-1.28l.2-2.76-2.64-.6a8.1 8.1 0 00-1.4-.9L14 2h-4l-.85 2.88c-.5.2-.97.5-1.4.9l-2.64.6.2 2.76c-.28.4-.53.83-.74 1.28L3.17 10.84l1.4 2.42c.05.5.05 1 0 1.48l-1.4 2.42 1.4 2.42c.21.45.46.88.74 1.28l-.2 2.76 2.64.6c.43.4.9.7 1.4.9L10 22h4l.85-2.88c.5-.2.97-.5 1.4-.9l2.64-.6-.2-2.76c.28-.4.53-.83.74-1.28z',
  salir: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
}

function SvgIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

/**
 * Nav 4 tabs: Hoy | Mapa | Clientes | Más
 * Stock / Gerencia / Admin / Salir viven en el sheet Más (menos ruido).
 */
export function NavBar({ esGerente, onLogout }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const primary = [
    { to: '/', label: 'Hoy', icon: ICON.hoy },
    { to: '/mapa', label: 'Mapa', icon: ICON.mapa },
    { to: '/cartera', label: 'Clientes', icon: ICON.clientes },
    { to: '/stock', label: 'Stock', icon: ICON.stock },
  ]

  const morePaths = ['/gerencia', '/admin']
  const moreActive = morePaths.some(p => loc.pathname.startsWith(p))

  const moreItems = []
  if (esGerente) {
    moreItems.push(
      { to: '/gerencia', label: 'Gerencia', sub: 'Resultado del mes y mix', icon: ICON.gerencia },
      { to: '/admin', label: 'Admin', sub: 'Zonas, precios, metas, usuarios', icon: ICON.admin },
    )
  }

  function go(to) {
    setMoreOpen(false)
    nav(to)
  }

  return (
    <>
      {/* Indicador offline */}
      {!online && (
        <div className="bs-offline-pill" role="status">
          Sin conexión · los cambios se guardan y se envían después
        </div>
      )}

      {moreOpen && (
        <div className="bs-more-scrim" onClick={() => setMoreOpen(false)} role="presentation">
          <div
            className="bs-more-sheet"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Más opciones"
          >
            <div className="bs-more-handle" />
            <div className="bs-more-title">Más</div>
            {moreItems.map(it => (
              <button
                key={it.to}
                type="button"
                className={'bs-more-item' + (loc.pathname.startsWith(it.to) ? ' is-active' : '')}
                onClick={() => go(it.to)}
              >
                <span className="bs-more-ico">
                  <SvgIcon d={it.icon} />
                </span>
                <span className="bs-more-txt">
                  <strong>{it.label}</strong>
                  <span>{it.sub}</span>
                </span>
              </button>
            ))}
            {onLogout && (
              <button
                type="button"
                className="bs-more-item bs-more-logout"
                onClick={() => {
                  setMoreOpen(false)
                  onLogout()
                }}
              >
                <span className="bs-more-ico">
                  <SvgIcon d={ICON.salir} />
                </span>
                <span className="bs-more-txt">
                  <strong>Cerrar sesión</strong>
                  <span>Salir de la app</span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="navbar" role="navigation" aria-label="Principal">
        <div className="navbar-inner navbar-inner-4">
          {primary.map(it => {
            const active =
              loc.pathname === it.to ||
              (it.to === '/mapa' && loc.pathname.startsWith('/visita'))
            return (
              <button
                key={it.to}
                type="button"
                className={'nav-item' + (active ? ' active' : '')}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setMoreOpen(false)
                  nav(it.to)
                }}
              >
                <SvgIcon d={it.icon} />
                <span>{it.label}</span>
              </button>
            )
          })}
          <button
            type="button"
            className={'nav-item' + (moreActive || moreOpen ? ' active' : '')}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(o => !o)}
          >
            <SvgIcon d={ICON.mas} />
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  )
}

export function AlertasDia() {
  const [alertas, setAlertas] = useState([])
  useEffect(() => {
    ;(async () => {
      const out = []
      const { data: cart } = await supabase
        .from('cartera')
        .select('estado_fuga,nombre_cliente,dias_sin_comprar')
      if (cart) {
        const riesgo = cart.filter(c => (c.estado_fuga || '').includes('3_EN_RIESGO')).length
        const superoP = cart.filter(c => c.dias_sin_comprar != null && c.dias_sin_comprar > 60).length
        if (riesgo > 0)
          out.push({ t: 'riesgo', txt: `${riesgo} clientes en riesgo de fuga`, cls: 'a-orange' })
        if (superoP > 0)
          out.push({ t: 'inactivos', txt: `${superoP} clientes +60 dias sin comprar`, cls: 'a-red' })
      }
      const { data: stk } = await supabase
        .from('stock')
        .select('stock_operativo,es_foco_mes,producto_nombre')
      if (stk) {
        const negFoco = stk.filter(s => s.es_foco_mes && Number(s.stock_operativo) < 0).length
        if (negFoco > 0)
          out.push({ t: 'stock', txt: `${negFoco} productos foco sin stock`, cls: 'a-red' })
      }
      setAlertas(out)
    })()
  }, [])
  if (!alertas.length) return null
  return (
    <div className="alertas-dia">
      {alertas.map((a, i) => (
        <div key={i} className={'alerta-chip ' + (a.cls || '')}>
          {a.txt}
        </div>
      ))}
    </div>
  )
}

export function DataAsOfBanner({ date }) {
  if (!date) return null
  const d = typeof date === 'string' ? date : ''
  return (
    <div className="data-as-of muted" style={{ fontSize: 11, marginBottom: 8 }}>
      Datos al {d}
    </div>
  )
}
