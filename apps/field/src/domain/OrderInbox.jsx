import { useCallback, useEffect, useState } from 'react'
import {
  listarPedidosHoy,
  listarPedidosHistorial,
  folioPedido,
  totalPedido,
  etiquetaEstadoPedido,
  marcarPedidoEstado,
  buildWhatsAppBodega,
} from '../lib/pedido.js'
import {
  siguientesEstados,
  normalizarEstado,
  esPendienteOperativo,
  colorEstado,
  ESTADOS_PEDIDO,
} from '../lib/pedidoEstados.js'

/**
 * Order Inbox — ciclo catálogo/field → confirmar → bodega → entregado
 */
export default function OrderInbox({ ejecutivoId, onOpenPedido, onChanged }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!ejecutivoId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const [hoy, hist] = await Promise.all([
        listarPedidosHoy(ejecutivoId),
        listarPedidosHistorial({ ejecutivoId, dias: 7, limit: 40 }),
      ])
      if (hoy.error && hist.error) {
        setErr(hoy.error.message || hist.error.message || 'Error al cargar pedidos')
        setRows([])
        return
      }
      const map = new Map()
      for (const p of [...(hoy.data || []), ...(hist.data || [])]) {
        if (p?.id) map.set(p.id, p)
      }
      const list = Array.from(map.values()).sort((a, b) => {
        const score = p => {
          let s = 0
          const st = normalizarEstado(p.estado, p.fuente)
          if (esPendienteOperativo(st, p.fuente)) s += 80
          if (p.fuente === 'catalogo_publico') s += 20
          if (st === 'recibido' || st === 'borrador') s += 40
          return s
        }
        const d = score(b) - score(a)
        if (d !== 0) return d
        return new Date(b.creado_en || 0) - new Date(a.creado_en || 0)
      })
      setRows(list.slice(0, 25))
    } catch (e) {
      setErr(e.message || 'Error de red')
    } finally {
      setLoading(false)
    }
  }, [ejecutivoId])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  async function setEstado(p, estado) {
    if (!p?.id || busyId) return
    setBusyId(p.id)
    try {
      const { error } = await marcarPedidoEstado(p.id, estado)
      if (error) throw error
      setRows(prev => prev.map(x => (x.id === p.id ? { ...x, estado } : x)))
      onChanged?.({ id: p.id, estado })
      await load()
    } catch (e) {
      setErr(e.message || 'No se pudo actualizar')
    } finally {
      setBusyId(null)
    }
  }

  if (!ejecutivoId) return null

  const nPend = rows.filter(p => esPendienteOperativo(p.estado, p.fuente)).length

  return (
    <div className="card oi-card" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="oi-head"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: 'var(--brand)' }}>
          INBOX PEDIDOS
          {nPend > 0 && (
            <span style={{
              marginLeft: 8, background: 'var(--brand)', color: '#fff', borderRadius: 999,
              padding: '2px 8px', fontSize: 11,
            }}>
              {nPend}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? 'Ocultar' : 'Ver'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</div>}
          {err && <div style={{ fontSize: 12, color: 'var(--danger-dk)', marginBottom: 8 }}>{err}</div>}
          {!loading && rows.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Sin pedidos recientes. Los del catálogo web aparecen acá.
            </div>
          )}
          {rows.map(p => {
            const n = Array.isArray(p.lineas) ? p.lineas.length : 0
            const tot = totalPedido(p)
            const et = etiquetaEstadoPedido(p.estado, p.fuente)
            const hora = p.creado_en
              ? new Date(p.creado_en).toLocaleString('es-CL', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })
              : ''
            const isWeb = p.fuente === 'catalogo_publico'
            const stNorm = normalizarEstado(p.estado, p.fuente)
            const nexts = siguientesEstados(p.estado, p.fuente).filter(s => s.id !== 'cancelado')
            const canCancel = !['cancelado', 'entregado'].includes(stNorm)
            const col = et.color || colorEstado(p.estado, p.fuente)

            return (
              <div
                key={p.id}
                style={{ borderTop: '1px solid #ebe6df', padding: '14px 0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>
                        {folioPedido(p.id)}
                      </span>
                      {isWeb && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: 'var(--teal-lt)', color: 'var(--teal)',
                        }}>
                          Web
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        background: col + '18', color: col, border: `1px solid ${col}40`,
                      }}>
                        {et.label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', lineHeight: 1.25 }}>
                      {p.nombre_cliente || p.cliente_key || 'Cliente'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                      {n} línea{n === 1 ? '' : 's'}
                      {tot > 0 ? ` · $${Math.round(tot).toLocaleString('es-CL')}` : ''}
                      {hora ? ` · ${hora}` : ''}
                    </div>
                    {/* Pipeline visual: dónde está el pedido */}
                    <div className="oi-pipeline" aria-hidden>
                      {ESTADOS_PEDIDO.filter(e => e.id !== 'cancelado' && e.id !== 'borrador').map((e, i, arr) => {
                        const order = ['recibido','confirmado','preparado','enviado','entregado']
                        const cur = order.indexOf(stNorm)
                        const idx = order.indexOf(e.id)
                        const done = cur >= 0 && idx >= 0 && idx <= cur
                        const active = e.id === stNorm
                        return (
                          <span key={e.id} className={'oi-step' + (done ? ' is-done' : '') + (active ? ' is-active' : '')}>
                            {e.label}
                            {i < arr.length - 1 ? <i className="oi-step-sep">·</i> : null}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={btnSoft}
                    onClick={() => onOpenPedido?.(p)}
                  >
                    Abrir
                  </button>
                  {nexts.slice(0, 2).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={s.id === 'confirmado' || s.id === 'enviado' || s.id === 'entregado' ? 'btn-primary' : 'btn-secondary'}
                      style={s.id === 'confirmado' || s.id === 'enviado' || s.id === 'entregado' ? btnPrimary : btnSoft}
                      disabled={busyId === p.id}
                      onClick={() => setEstado(p, s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                  {['confirmado', 'preparado', 'enviado'].includes(stNorm) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={btnSoft}
                      onClick={() => {
                        const text = buildWhatsAppBodega({
                          cliente: { nombre_cliente: p.nombre_cliente, cliente_key: p.cliente_key },
                          lineas: p.lineas || [],
                          nota: p.nota,
                        })
                        window.open(`https://wa.me/?text=${encodeURIComponent(text || '')}`, '_blank', 'noopener')
                        if (stNorm === 'confirmado' || stNorm === 'preparado') setEstado(p, 'enviado')
                      }}
                    >
                      WhatsApp bodega
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      style={btnDanger}
                      disabled={busyId === p.id}
                      onClick={() => setEstado(p, 'cancelado')}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={load}
            style={{
              marginTop: 6, border: 'none', background: 'none', color: 'var(--muted)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}
          >
            Actualizar
          </button>
        </div>
      )}
    </div>
  )
}

const btnSoft = {
  fontSize: 13,
  fontWeight: 700,
  padding: '10px 14px',
  borderRadius: 12,
  minHeight: 40,
  border: '1px solid #e7e5e4',
  background: '#fff',
  color: 'var(--ink)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnPrimary = {
  fontSize: 13,
  fontWeight: 750,
  padding: '10px 14px',
  borderRadius: 12,
  minHeight: 40,
  border: 'none',
  background: 'var(--brand)',
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnDanger = {
  fontSize: 13,
  fontWeight: 700,
  padding: '10px 14px',
  borderRadius: 12,
  minHeight: 40,
  border: '1px solid #fecaca',
  background: 'var(--danger-lt)',
  color: 'var(--danger-dk)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
