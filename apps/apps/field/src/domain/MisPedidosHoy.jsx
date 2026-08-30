import { useEffect, useState } from 'react'
import { listarPedidosHoy, folioPedido } from '../lib/pedido.js'

/**
 * Lista compacta de pedidos guardados hoy (P0 terreno).
 */
export default function MisPedidosHoy({ ejecutivoId, onOpenPedido }) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data, error } = await listarPedidosHoy(ejecutivoId)
      if (!live) return
      if (error) setErr(error.message || 'No se pudieron cargar pedidos')
      else setRows(data || [])
    })()
    return () => { live = false }
  }, [ejecutivoId])

  if (!ejecutivoId) return null

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: 'var(--brand)' }}>
          PEDIDOS DE HOY · {rows.length}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? 'Ocultar' : 'Ver'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {err && (
            <div style={{ fontSize: 12, color: 'var(--danger-dk)', marginBottom: 8 }}>
              {err}
            </div>
          )}
          {!err && rows.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Todavía no hay pedidos hoy. Desde el cliente: Catálogo o Pedido interno.
            </div>
          )}
          {rows.map(p => {
            const n = Array.isArray(p.lineas) ? p.lineas.length : 0
            const hora = p.creado_en
              ? new Date(p.creado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPedido?.(p)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 0',
                  border: 'none',
                  borderTop: '1px solid #ebe6df',
                  background: 'transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  cursor: onOpenPedido ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--brand)', letterSpacing: '0.04em' }}>
                      {folioPedido(p.id)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {p.fuente === 'catalogo_publico' ? '🌐 catálogo' : (p.estado === 'enviado' || p.estado === 'recibido' ? '✓ ' + p.estado : '· ' + (p.estado || 'borrador'))}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                    {p.nombre_cliente || p.cliente_key || 'Sin nombre de cliente'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {n} línea{n === 1 ? '' : 's'}
                    {(Number(p.total_estimado) > 0) ? ` · $${Math.round(Number(p.total_estimado)).toLocaleString('es-CL')}` : ''}
                    {p.nota ? ` · ${String(p.nota).slice(0, 30)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {hora}
                  {onOpenPedido ? ' · editar' : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
