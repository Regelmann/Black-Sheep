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
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    },
    {
      to: '/cartera',
      label: 'Cartera',
      icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8z',
    },
    {
      to: '/metas',
      label: 'Metas',
      icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    },
    {
      to: '/stock',
      label: 'Stock',
      icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    },
  ]
  if (esGerente) {
    items.push({
      to: '/gerencia',
      label: 'Gerencia',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    })
  }

  return (
    <nav className="navbar" role="navigation" aria-label="Principal">
      {items.map(it => {
        const active = loc.pathname === it.to
        return (
          <button
            key={it.to}
            type="button"
            className={'nav-item' + (active ? ' active' : '')}
            aria-current={active ? 'page' : undefined}
            onClick={() => nav(it.to)}
          >
            {active && (
              <span className="absolute top-0 w-5 h-0.5 rounded-full bg-brand" />
            )}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={it.icon} />
            </svg>
            <span>{it.label}</span>
          </button>
        )
      })}
      {onLogout && (
        <button
          type="button"
          className="nav-item"
          onClick={onLogout}
          title="Cerrar sesión"
          style={{ color: '#ef4444' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span>Salir</span>
        </button>
      )}
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
