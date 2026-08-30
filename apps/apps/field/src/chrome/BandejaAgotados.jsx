/**
 * BandejaAgotados — las acciones que no pudieron subir, visibles.
 *
 * Antes, un item que agotaba los reintentos sólo hacía `console.error`.
 * Nadie lo veía. Un pedido agotado es plata real: si no sube, el cliente
 * no recibe el despacho y el vendedor se entera cuando lo llaman.
 *
 * Esto NO se resuelve reintentando más: si falló 8 veces con backoff, hay
 * algo que una persona tiene que decidir. Lo único correcto es mostrarlo.
 */
import { useEffect, useState, useCallback } from 'react'
import { itemsAgotados, revivirItem, removeActionFromQueue, flushActionQueue } from '../lib/offline.js'
import { syncHandlers } from '../lib/syncHandlers.js'
import { onOutboxChange } from '../lib/outboxDb.js'

const ETIQUETA = {
  checkin:   'Check-in',
  pedido:    'Pedido',
  nota:      'Nota',
  completar: 'Cierre de visita',
  no_venta:  'Visita sin venta',
}

export function BandejaAgotados() {
  const [items, setItems] = useState([])
  const [abierta, setAbierta] = useState(false)

  const refrescar = useCallback(() => setItems(itemsAgotados()), [])

  useEffect(() => {
    refrescar()
    return onOutboxChange(refrescar)
  }, [refrescar])

  const reintentar = useCallback(async (id) => {
    revivirItem(id)
    await flushActionQueue(syncHandlers)
    refrescar()
  }, [refrescar])

  const descartar = useCallback((id) => {
    removeActionFromQueue(id)
    refrescar()
  }, [refrescar])

  if (!items.length) return null

  return (
    <>
      <button
        type="button"
        className="bs-agotados-pill"
        onClick={() => setAbierta(true)}
      >
        {items.length} {items.length === 1 ? 'acción no subió' : 'acciones no subieron'}
      </button>

      {abierta && (
        <div className="bs-agotados-backdrop" onClick={() => setAbierta(false)}>
          <div
            className="bs-agotados-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Acciones sin subir"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="bs-agotados-title">No se pudieron subir</h2>
            <p className="bs-agotados-desc">
              Se intentó varias veces y no funcionó. Los datos están guardados
              en el teléfono: nada se perdió.
            </p>

            {items.map((it) => (
              <div className="bs-agotado" key={it.id}>
                <div className="bs-agotado-body">
                  <p className="bs-agotado-tipo">{ETIQUETA[it.type] || it.type}</p>
                  <p className="bs-agotado-when">
                    {it.enqueuedAt
                      ? new Date(it.enqueuedAt).toLocaleString('es-CL', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })
                      : ''}
                    {it.attempts ? ` · ${it.attempts} intentos` : ''}
                  </p>
                  {it.lastError && <p className="bs-agotado-err">{it.lastError}</p>}
                </div>
                <div className="bs-agotado-acciones">
                  <button type="button" className="bs-agotado-retry" onClick={() => reintentar(it.id)}>
                    Reintentar
                  </button>
                  <button type="button" className="bs-agotado-drop" onClick={() => descartar(it.id)}>
                    Descartar
                  </button>
                </div>
              </div>
            ))}

            <button type="button" className="bs-agotados-cerrar" onClick={() => setAbierta(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default BandejaAgotados
