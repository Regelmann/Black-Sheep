import { clp } from '../../../../packages/datos/formato.js'

/** Una fila de cliente. El color del borde ES el estado: se lee de reojo. */
export function ClienteFila({ c, pie }) {
  return (
    <article className={`cliente ${c.estado || ''}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="nombre">{c.nombre || c.cliente_key}</p>
        <p className="detalle">{pie || c.cliente_key}</p>
        {c.es_bloqueado && <span className="pastilla roja" style={{ marginTop: 6 }}>bloqueado</span>}
      </div>
      <div className="derecha">
        <p className="cifra">{clp(c.venta_mtd)}</p>
        {c.promedio_3m > 0 && (
          <p className="detalle">de {clp(c.promedio_3m)} normal</p>
        )}
      </div>
    </article>
  )
}
