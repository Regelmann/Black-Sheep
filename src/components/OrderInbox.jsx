import { useCallback, useEffect, useState } from 'react'
import {
  listarInboxPedidos,
  folioPedido,
  totalPedido,
  formatFechaPedido,
  marcarPedidoEstado,
  siguienteEstadoPipeline,
  PIPELINE_PEDIDO,
  buildWhatsAppBodega,
} from '../lib/pedido'

const money = n => {
  const v = Number(n)
  if (!v || v <= 0) return '—'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

function metaEstado(estado) {
  const e = String(estado || '').toLowerCase()
  return PIPELINE_PEDIDO.find(x => x.id === e) || { id: e, label: e || '—', color: '#a8a29e' }
}

/**
 * Order Inbox — pedidos del catálogo web pendientes de pipeline.
 * Bridge: recibido → confirmado → pendiente_carga → enviado_bodega → cargado
 */
export default function OrderInbox({ ejecutivoId, ejecutivoNombre, onOpenPedido, onCount }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    if (!ejecutivoId) {
      setItems([])
      setLoading(false)
      onCount?.(0)
      return
    }
    setLoading(true)
    setErr('')
    const { data, error } = await listarInboxPedidos(ejecutivoId)
    if (error) setErr(error.message || 'No se pudo cargar inbox')
    const rows = data || []
    setItems(rows)
    const nuevos = rows.filter(p => String(p.estado || '').toLowerCase() === 'recibido').length
    onCount?.(nuevos)
    setLoading(false)
  }, [ejecutivoId, onCount])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // refresh 1 min
    return () => clearInterval(t)
  }, [load])

  async function avanzar(p) {
    const next = siguienteEstadoPipeline(p.estado)
    if (!next) return
    setBusyId(p.id)
    const { error } = await marcarPedidoEstado(p.id, next)
    if (!error) {
      setItems(prev => prev.map(x => (x.id === p.id ? { ...x, estado: next } : x)).filter(x => {
        const est = String(x.id === p.id ? next : x.estado).toLowerCase()
        return !['cargado', 'cancelado'].includes(est)
      }))
      if (String(p.estado).toLowerCase() === 'recibido') onCount?.(c => Math.max(0, (typeof c === 'number' ? c : 0) - 1))
    }
    setBusyId(null)
    load()
  }

  async function cancelar(p) {
    setBusyId(p.id)
    await marcarPedidoEstado(p.id, 'cancelado')
    setBusyId(null)
    load()
  }

  function waBodega(p) {
    const { url } = buildWhatsAppBodega({
      cliente: { nombre_cliente: p.nombre_cliente, cliente_key: p.cliente_key },
      lineas: Array.isArray(p.lineas) ? p.lineas : [],
      ejecutivoNombre,
      nota: p.nota,
    })
    if (url) window.open(url, '_blank', 'noopener')
  }

  const nuevos = items.filter(p => String(p.estado || '').toLowerCase() === 'recibido')

  if (!loading && items.length === 0 && !err) return null

  return (
    <div
      className="card"
      style={{
        padding: '12px 14px',
        border: nuevos.length ? '1.5px solid #5eead4' : '1px solid #e7e5e4',
        background: nuevos.length ? 'linear-gradient(180deg,#f0fdfa 0%,#fff 40%)' : '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f766e', display: 'flex', alignItems: 'center', gap: 8 }}>
            🌐 Inbox pedidos web
            {nuevos.length > 0 && (
              <span
                style={{
                  background: '#0d9488',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                {nuevos.length} nuevo{nuevos.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#78716c', fontWeight: 600 }}>
            Catálogo → confirmar → carga / bodega
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          style={{
            border: '1px solid #ccfbf1',
            background: '#fff',
            borderRadius: 999,
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: '#0f766e',
          }}
        >
          Actualizar
        </button>
      </div>

      {loading && <div style={{ fontSize: 13, color: '#a8a29e' }}>Cargando inbox…</div>}
      {err && (
        <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: 10, borderRadius: 10 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(p => {
          const n = Array.isArray(p.lineas) ? p.lineas.length : 0
          const total = totalPedido(p)
          const meta = metaEstado(p.estado)
          const next = siguienteEstadoPipeline(p.estado)
          const expanded = openId === p.id
          const isNew = String(p.estado || '').toLowerCase() === 'recibido'
          return (
            <div
              key={p.id}
              style={{
                border: isNew ? '1.5px solid #5eead4' : '1px solid #e7e5e4',
                borderRadius: 14,
                background: '#fff',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : p.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  padding: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#0d9488' }}>{folioPedido(p.id)}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: meta.color,
                        background: meta.color + '18',
                        borderRadius: 999,
                        padding: '2px 7px',
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1614' }}>
                    {p.nombre_cliente || p.cliente_key}
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c' }}>
                    {n} línea{n === 1 ? '' : 's'}
                    {total > 0 ? ` · ${money(total)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', whiteSpace: 'nowrap' }}>
                  {formatFechaPedido(p.creado_en)}
                  <div style={{ textAlign: 'right', marginTop: 4 }}>{expanded ? '▴' : '▾'}</div>
                </div>
              </button>

              {expanded && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid #f5f5f4' }}>
                  {(Array.isArray(p.lineas) ? p.lineas : []).map((l, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid #f5f5f4',
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 650 }}>{l.nombre || l.sku}</div>
                        <div style={{ fontSize: 11, color: '#a8a29e' }}>
                          {l.cantidad} {l.unidad || 'ud'}
                          {Number(l.precio) > 0 ? ` × ${money(l.precio)}` : ''}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#0d9488' }}>
                        {Number(l.precio) > 0 && Number(l.cantidad) > 0
                          ? money(Number(l.precio) * Number(l.cantidad))
                          : '—'}
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {next && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => avanzar(p)}
                        style={{
                          flex: 1,
                          minWidth: 120,
                          padding: '10px',
                          borderRadius: 10,
                          border: 'none',
                          background: '#0d9488',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        → {metaEstado(next).label}
                      </button>
                    )}
                    {onOpenPedido && (
                      <button
                        type="button"
                        onClick={() => onOpenPedido(p)}
                        style={{
                          flex: 1,
                          minWidth: 90,
                          padding: '10px',
                          borderRadius: 10,
                          border: '1px solid #e7e5e4',
                          background: '#fff',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {(String(p.estado).toLowerCase() === 'pendiente_carga' ||
                      String(p.estado).toLowerCase() === 'enviado_bodega' ||
                      String(p.estado).toLowerCase() === 'confirmado') && (
                      <button
                        type="button"
                        onClick={() => waBodega(p)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid #bbf7d0',
                          background: '#ecfdf5',
                          color: '#15803d',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        WA bodega
                      </button>
                    )}
                    {String(p.estado).toLowerCase() !== 'cancelado' && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => cancelar(p)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid #fecaca',
                          background: '#fff',
                          color: '#b91c1c',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
