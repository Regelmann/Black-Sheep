// Componentes compartidos: navegación inferior y helpers
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

export function NavBar({ esGerente, onLogout }) {
  const nav = useNavigate()
  const loc = useLocation()

  const items = [
    {
      to: '/',
      label: 'Ruta',
      icon: (a) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={a ? 0 : 1.7}>
          {a ? (
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </>
          )}
        </svg>
      ),
    },
    {
      to: '/cartera',
      label: 'Cartera',
      icon: (a) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke={a ? 'none' : 'currentColor'} strokeWidth="1.7">
          {a ? (
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          )}
        </svg>
      ),
    },
    {
      to: '/metas',
      label: 'Metas',
      icon: (a) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke={a ? 'none' : 'currentColor'} strokeWidth="1.7">
          {a ? (
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          )}
        </svg>
      ),
    },
    {
      to: '/stock',
      label: 'Stock',
      icon: (a) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke={a ? 'none' : 'currentColor'} strokeWidth="1.7">
          {a ? (
            <path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 2.54 15.97.5 13.5.5c-1.3 0-2.44.56-3.29 1.44L9 3.17l-1.21-1.23C6.94 1.06 5.8.5 4.5.5 2.03.5 0 2.54 0 4.66c0 .46.11.9.18 1.34H0v14c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-9 13H2V8h9v11zm11 0h-9V8h9v11z"/>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
          )}
        </svg>
      ),
    },
  ]

  if (esGerente) {
    items.push({
      to: '/gerencia',
      label: 'Gerencia',
      icon: (a) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke={a ? 'none' : 'currentColor'} strokeWidth="1.7">
          {a ? (
            <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          )}
        </svg>
      ),
    })
  }

  const allItems = [...items]
  if (onLogout) {
    allItems.push({
      to: '__logout__',
      label: 'Salir',
      isLogout: true,
      icon: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
      ),
    })
  }

  return (
    <nav
      role="navigation"
      aria-label="Principal"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Pill flotante */}
      <div style={{
        margin: '0 12px 10px',
        background: '#1a1614',
        borderRadius: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '8px 4px',
        boxShadow: '0 8px 32px rgba(26,22,20,0.32), 0 2px 8px rgba(26,22,20,0.18)',
      }}>
        {allItems.map(it => {
          const active = !it.isLogout && loc.pathname === it.to
          return (
            <button
              key={it.to}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => it.isLogout ? onLogout() : nav(it.to)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                background: active ? '#c2410c' : 'transparent',
                border: 'none',
                borderRadius: 14,
                padding: '8px 4px 7px',
                cursor: 'pointer',
                color: it.isLogout ? '#f87171' : active ? '#fff' : '#a8a29e',
                transition: 'all 0.18s cubic-bezier(.4,0,.2,1)',
                WebkitTapHighlightColor: 'transparent',
                minWidth: 0,
              }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 22,
                transform: active ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.18s',
              }}>
                {it.icon(active)}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                letterSpacing: active ? '0.02em' : '0.01em',
                lineHeight: 1,
                color: it.isLogout ? '#f87171' : active ? '#fff' : '#78716c',
                whiteSpace: 'nowrap',
              }}>
                {it.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
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
    <div className="alertas">
      {alertas.map((a, i) => (
        <div key={i} className={'alerta ' + a.cls}>
          <span className="alerta-dot" />
          {a.txt}
        </div>
      ))}
    </div>
  )
}


/** Banner sticky: última fecha de datos (fecha_snapshot de la bajada) */
export function DataAsOfBanner({ fecha, extra }) {
  if (!fecha && !extra) return null
  const f = fecha ? String(fecha).slice(0, 10) : null
  return (
    <div
      style={{
        margin: '0 0 10px',
        padding: '8px 12px',
        borderRadius: 12,
        background: 'linear-gradient(90deg, #fff7ed, #fafaf9)',
        border: '1px solid #fed7aa',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: '#9a3412',
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 14 }}>📅</span>
      <span style={{ flex: 1 }}>
        {f ? <>Datos al <b>{f}</b></> : 'Datos de la última bajada'}
        {extra ? <> · {extra}</> : null}
      </span>
    </div>
  )
}
