import { useEffect, useState } from 'react'
import { listarPedidosHoy, folioPedido } from '../lib/pedido.js'
import { loadActionQueue, revivirItem } from '../lib/offline.js'
import { onOutboxChange } from '../lib/outboxDb.js'
import { pedidosEnCola, etiquetaEstadoPedido } from '../lib/pedidosEnCola.js'
import { syncHandlers } from '../lib/syncHandlers.js'
import { runSyncFlush } from '../lib/sync/engine.js'

/**
 * Lista compacta de pedidos guardados hoy (P0 terreno).
 *
 * Muestra DOS fuentes, en orden de confianza:
 *   1. Pedidos en el teléfono (cola offline) — con su estado real:
 *      "en el teléfono · falta subir" o "falló la subida". Nunca
 *      desaparecen hasta que llegan al servidor.
 *   2. Pedidos ya en el servidor.
 *
 * Un pedido tomado sin señal que no apareciera acá era invisible: el
 * vendedor no podía saber si faltaba subir, y el agotado tras 8
 * reintentos pasaba totalmente desapercibido (ROADMAP 2.3).
 */
export default function MisPedidosHoy({ ejecutivoId, onOpenPedido }) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(true)
  const [enCola, setEnCola] = useState([])
  const [reintentando, setReintentando] = useState(null)

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

  // Reactivo, sin polling: la cola notifica cada enqueue/flush (mismo
  // mecanismo que BandejaAgotados).
  useEffect(() => {
    const refrescar = () => setEnCola(pedidosEnCola(loadActionQueue()))
    refrescar()
    return onOutboxChange(refrescar)
  }, [])

  async function reintentar(id) {
    setReintentando(id)
    try {
      revivirItem(id)
      // force: lo pidió el usuario; si la red sigue muerta el item
      // vuelve a backoff y a la bandeja — no se pierde.
      await runSyncFlush(syncHandlers, { force: true })
    } catch { void 0 }
    finally {
      setReintentando(null)
      setEnCola(pedidosEnCola(loadActionQueue()))
    }
  }

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
          PEDIDOS DE HOY · {rows.length + enCola.length}
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
          {!err && rows.length === 0 && enCola.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Todavía no hay pedidos hoy. Desde el cliente: Catálogo o Pedido interno.
            </div>
          )}

          {enCola.map(p => {
            const agotado = p.estado === 'agotado'
            const hora = p.enqueuedAt
              ? new Date(p.enqueuedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <div
                key={`cola-${p.id}`}
                style={{
                  padding: '10px 0',
                  borderTop: '1px solid #ebe6df',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: agotado ? 'var(--danger-lt)' : 'var(--warn-lt)',
                  borderRadius: 10,
                  marginTop: 6,
                  paddingLeft: 10,
                  paddingRight: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        color: agotado ? 'var(--danger-dk)' : 'var(--warn-dk)',
                      }}
                    >
                      {agotado ? '⚠' : '⏳'} {etiquetaEstadoPedido(p.estado)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                    {p.cliente}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {p.lineas.length} línea{p.lineas.length === 1 ? '' : 's'}
                    {p.total > 0 ? ` · $${p.total.toLocaleString('es-CL')}` : ''}
                    {hora ? ` · ${hora}` : ''}
                  </div>
                  {agotado && p.ultimoError && (
                    <div style={{ fontSize: 11, color: 'var(--danger-dk)', marginTop: 2 }}>
                      {p.ultimoError.slice(0, 60)}
                    </div>
                  )}
                </div>
                {agotado && (
                  <button
                    type="button"
                    disabled={reintentando === p.id}
                    onClick={() => reintentar(p.id)}
                    style={{
                      border: '1px solid var(--danger-dk)',
                      background: '#fff',
                      color: 'var(--danger-dk)',
                      borderRadius: 8,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      height: 'fit-content',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {reintentando === p.id ? 'Subiendo…' : 'Reintentar'}
                  </button>
                )}
              </div>
            )
          })}

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
