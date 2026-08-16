import { useEffect, useState } from 'react'
import { listarPedidosHoy } from '../lib/pedido'

/**
 * Lista compacta de pedidos guardados hoy (P0 terreno).
 */
export default function MisPedidosHoy({ ejecutivoId }) {
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
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: '#c2410c' }}>
          PEDIDOS DE HOY · {rows.length}
        </span>
        <span style={{ fontSize: 12, color: '#a8a29e' }}>{open ? 'Ocultar' : 'Ver'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {err && (
            <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>
              {err}
            </div>
          )}
          {!err && rows.length === 0 && (
            <div style={{ fontSize: 13, color: '#a8a29e' }}>
              Todavía no hay pedidos guardados hoy. Abrí un cliente → Pedido en terreno.
            </div>
          )}
          {rows.map(p => {
            const n = Array.isArray(p.lineas) ? p.lineas.length : 0
            const hora = p.creado_en
              ? new Date(p.creado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <div
                key={p.id}
                style={{
                  padding: '10px 0',
                  borderTop: '1px solid #ebe6df',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1614' }}>
                    {p.nombre_cliente || p.cliente_key || 'Cliente'}
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c' }}>
                    {n} línea{n === 1 ? '' : 's'}
                    {p.nota ? ` · ${String(p.nota).slice(0, 40)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', whiteSpace: 'nowrap' }}>
                  {hora}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
