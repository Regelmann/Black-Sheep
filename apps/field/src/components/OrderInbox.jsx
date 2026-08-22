import { useCallback, useEffect, useState } from 'react'
import {
  listarPedidosHoy,
  listarPedidosHistorial,
  folioPedido,
  totalPedido,
  etiquetaEstadoPedido,
  marcarPedidoEstado,
  actualizarEstadoPedido,
} from '../lib/pedido'
import {
  siguientesEstados,
  normalizarEstado,
  esPendienteOperativo,
  colorEstado,
} from '../lib/pedidoEstados'
import { buildWhatsAppBodega } from '../lib/pedido'

/**
 * Order Inbox — cierra el ciclo catálogo web → ejecutivo.
 * Muestra pedidos recibidos (catálogo) + del día, con acciones:
 * Abrir/editar · Confirmar · Enviar bodega · Cancelar
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
      const [hoy, pendientes] = await Promise.all([
        listarPedidosHoy(ejecutivoId),
        listarPedidosHistorial({
          ejecutivoId,
          dias: 7,
          limit: 40,
        }),
      ])
      if (hoy.error && pendientes.error) {
        setErr(hoy.error.message || pendientes.error.message || 'Error al cargar pedidos')
        setRows([])
        return
      }
      const map = new Map()
      for (const p of [...(hoy.data || []), ...(pendientes.data || [])]) {
        if (!p?.id) continue
        // Priorizar pendientes de catálogo y del día
        const prev = map.get(p.id)
        if (!prev) map.set(p.id, p)
      }
      const list = Array.from(map.values()).sort((a, b) => {
        const score = p => {
          let s = 0
          if (p.fuente === 'catalogo_publico' && (p.estado === 'recibido' || !p.estado)) s += 100
          if (p.estado === 'recibido' || p.estado === 'borrador') s += 50
          if (p.estado === 'confirmado') s += 20
          return s
        }
        const d = score(b) - score(a)
        if (d !== 0) return d
        return new Date(b.creado_en || 0) - new Date(a.creado_en || 0)
      })
      setRows(list.slice(0, 30))
    } catch (e) {
      setErr(e.message || 'Error de red')
    } finally {
      setLoading(false)
    }
  }, [ejecutivoId])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // refresh 1 min
    return () => clearInterval(t)
  }, [load])

  async function setEstado(p, estado) {
    if (!p?.id || busyId) return
    setBusyId(p.id)
    try {
      const { error } = await marcarPedidoEstado(p.id, estado)
      if (error) throw error
      setRows(prev =>
        prev.map(x => (x.id === p.id ? { ...x, estado } : x)).filter(x => x.estado !== 'cancelado' || x.id === p.id)
      )
      onChanged?.({ id: p.id, estado })
      await load()
    } catch (e) {
      setErr(e.message || 'No se pudo actualizar')
    } finally {
      setBusyId(null)
    }
  }

  if (!ejecutivoId) return null

  const pendientes = rows.filter(p => esPendienteOperativo(p.estado, p.fuente))
  const nPend = pendientes.length

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
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: '#c2410c' }}>
          INBOX PEDIDOS
          {nPend > 0 && (
            <span style={{
              marginLeft: 8, background: '#c2410c', color: '#fff', borderRadius: 999,
              padding: '2px 8px', fontSize: 11,
            }}>
              {nPend}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: '#a8a29e' }}>{open ? 'Ocultar' : 'Ver'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && <div style={{ fontSize: 13, color: '#a8a29e' }}>Cargando…</div>}
          {err && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{err}</div>}
          {!loading && rows.length === 0 && (
            <div style={{ fontSize: 13, color: '#a8a29e' }}>
              Sin pedidos recientes. Cuando un cliente pida por el catálogo web, aparece aquí.
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
            const col = colorEstado(p.estado, p.fuente)

            return (
              <div
                key={p.id}
                className="oi-row"
                style={{
                  borderTop: '1px solid #ebe6df',
                  padding: '12px 0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', letterSpacing: '0.04em' }}>
                        {folioPedido(p.id)}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                        background: isWeb ? '#ccfbf1' : '#f5f5f4',
                        color: isWeb ? '#0f766e' : '#78716c',
                      }}>
                        {isWeb ? 'Catálogo web' : 'Field'}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                        background: '#fff', border: `1px solid ${col}33`, color: col,
                      }}>
                        {et.label || stNorm}
                      </span>
                    </div>
                    <div style={{ fontWeight: 750, fontSize: 14, color: '#1a1614' }}>
                      {p.nombre_cliente || p.cliente_key || 'Cliente'}
                    </div>
                    <div style={{ fontSize: 12, color: '#78716c' }}>
                      {n} línea{n === 1 ? '' : 's'}
                      {tot > 0 ? ` · $${Math.round(tot).toLocaleString('es-CL')}` : ''}
                      {p.nota ? ` · ${String(p.nota).slice(0, 40)}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#a8a29e', marginTop: 2 }}>{hora}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '6px 10px' }}
                    onClick={() => onOpenPedido?.(p)}
                  >
                    Abrir / editar
                  </button>
                  {nexts.slice(0, 2).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={s.id === 'confirmado' || s.id === 'enviado' ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: 12, padding: '6px 10px' }}
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
                      style={{ fontSize: 12, padding: '6px 10px' }}
                      onClick={() => {
                        const text = buildWhatsAppBodega({
                          cliente: { nombre_cliente: p.nombre_cliente, cliente_key: p.cliente_key },
                          lineas: p.lineas || [],
                          nota: p.nota,
                        })
                        const url = `https://wa.me/?text=${encodeURIComponent(text || '')}`
                        window.open(url, '_blank', 'noopener')
                        if (stNorm === 'confirmado' || stNorm === 'preparado') setEstado(p, 'enviado')
                      }}
                    >
                      WhatsApp bodega
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      style={{
                        fontSize: 12, padding: '6px 10px', borderRadius: 10,
                        border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c',
                        fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}
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
              marginTop: 4, border: 'none', background: 'none', color: '#a8a29e',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}
          >
            Actualizar inbox
          </button>
        </div>
      )}
    </div>
  )
}
