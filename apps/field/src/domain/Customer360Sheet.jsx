import { useMemo } from 'react'
import { decideClient } from '../lib/decisionEngine.js'

const money = v => `$${Math.round(Number(v) || 0).toLocaleString('es-CL')}`
const clean = v => String(v || '').replace(/^\d+_?/, '').replace(/_/g, ' ')

/**
 * Customer 360 V11.
 * Presenta la evidencia que ya existe en cartera y la decisión única del Decision OS.
 * No hace consultas adicionales: la página que lo abre sigue siendo la fuente de datos.
 */
export default function Customer360Sheet({ cliente, onClose, onOrder, onVisit, onContact, onCatalog }) {
  const decision = useMemo(() => decideClient(cliente), [cliente])
  if (!cliente) return null

  const name = cliente.razon_social || cliente.nombre_cliente || cliente.nombre_comercial || 'Cliente'
  const mtd = Number(cliente.venta_mtd) || 0
  const prom = Number(cliente.venta_mensual) || 0
  const dias = Number(cliente.dias_sin_comprar)
  const ciclo = Number(cliente.ciclo_dias) || 0
  const pct = prom > 0 ? Math.round((mtd / prom) * 100) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cliente 360 ${name}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(18,15,13,.48)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <section
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--bg, #f8f7f5)', borderRadius: '24px 24px 0 0',
          boxShadow: '0 -18px 60px rgba(0,0,0,.2)', paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #f8f7f5)', padding: '10px 16px 8px', borderBottom: '1px solid #ebe6e0' }}>
          <div style={{ width: 42, height: 4, borderRadius: 99, background: '#d6d0ca', margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--brand)' }}>CUSTOMER 360</div>
              <h2 style={{ margin: '3px 0 0', fontSize: 20, lineHeight: 1.1, color: 'var(--ink)' }}>{name}</h2>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)' }}>{cliente.comuna || 'Sin comuna'}{cliente.segmento ? ` · ${cliente.segmento}` : ''}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 44, height: 44, border: 0, borderRadius: 14, background: '#fff', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {decision && (
            <div style={{ background: '#fff', border: '1.5px solid #fed7aa', borderRadius: 18, padding: 15, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: 'var(--brand)' }}>PRÓXIMA MEJOR ACCIÓN</span>
                <span style={{ fontSize: 11, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: decision.attention === 'now' ? '#fee2e2' : '#fff7ed', color: decision.attention === 'now' ? '#b91c1c' : '#9a3412' }}>{decision.score}/100</span>
              </div>
              <div style={{ marginTop: 7, fontSize: 17, fontWeight: 850, color: 'var(--ink)' }}>{decision.actionLabel}</div>
              <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>{decision.reason}</div>
              {decision.why?.slice(0, 3).map((x, i) => <div key={i} style={{ marginTop: 5, fontSize: 12, color: 'var(--ink-3)' }}>• {x}</div>)}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {[
              ['Venta MTD', money(mtd)],
              ['Promedio', money(prom)],
              ['Sin compra', Number.isFinite(dias) ? `${dias} días` : '—'],
              ['Ciclo', ciclo ? `${ciclo} días` : '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #ebe6e0', borderRadius: 14, padding: '12px 13px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)' }}>{label.toUpperCase()}</div>
                <div style={{ marginTop: 3, fontSize: 17, fontWeight: 850, color: 'var(--ink)' }}>{value}</div>
              </div>
            ))}
          </div>

          {pct != null && (
            <div style={{ marginTop: 12, background: '#fff', border: '1px solid #ebe6e0', borderRadius: 14, padding: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}><span>Ritmo vs promedio</span><span>{pct}%</span></div>
              <div style={{ height: 7, background: '#eeeae5', borderRadius: 99, overflow: 'hidden', marginTop: 7 }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: pct >= 100 ? 'var(--ok-mid2, #22c55e)' : pct >= 50 ? 'var(--warn, #f59e0b)' : 'var(--danger, #ef4444)' }} /></div>
            </div>
          )}

          <div style={{ marginTop: 12, background: '#fff', border: '1px solid #ebe6e0', borderRadius: 14, padding: 13 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>ESTADO COMERCIAL</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {cliente.estado_fuga && <span className="badge b-gray">{clean(cliente.estado_fuga)}</span>}
              {cliente.es_bloqueado && <span className="badge b-red">Bloqueado</span>}
              {cliente.oferta_real && <span className="badge b-blue">{clean(cliente.oferta_real).slice(0, 50)}</span>}
            </div>
            {cliente.ultima_compra && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>Última compra: {String(cliente.ultima_compra).slice(0, 10)}</div>}
            {cliente.direccion && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)' }}>{cliente.direccion}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => onOrder?.(cliente)} style={{ minHeight: 48, border: 0, borderRadius: 14, background: 'var(--brand)', color: '#fff', fontWeight: 850, cursor: 'pointer' }}>Armar pedido</button>
            <button type="button" onClick={() => onContact?.(cliente)} style={{ minHeight: 48, border: '1px solid #ded8d1', borderRadius: 14, background: '#fff', color: 'var(--ink)', fontWeight: 800, cursor: 'pointer' }}>Contactar</button>
            <button type="button" onClick={() => onVisit?.(cliente)} style={{ minHeight: 48, border: '1px solid #ded8d1', borderRadius: 14, background: '#fff', color: 'var(--ink)', fontWeight: 800, cursor: 'pointer' }}>Visitar</button>
            <button type="button" onClick={() => onCatalog?.(cliente)} style={{ minHeight: 48, border: '1px solid #ded8d1', borderRadius: 14, background: '#fff', color: 'var(--ink)', fontWeight: 800, cursor: 'pointer' }}>Catálogo / precios</button>
          </div>
        </div>
      </section>
    </div>
  )
}
