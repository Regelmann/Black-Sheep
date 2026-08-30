/**
 * LA MEJOR OPORTUNIDAD DEL DÍA
 *
 * Una sola tarjeta que responde las cuatro preguntas de una vez:
 *   A QUIÉN     el nombre, grande
 *   POR QUÉ AHORA  días sin comprar contra SU ciclo
 *   QUÉ         los productos que se le acaban, con stock
 *   A QUÉ PRECIO   el último que ÉL pagó, no el de lista
 *   CUÁNTO      el monto, que es lo que decide si vale el viaje
 *
 * Regla visual: OSCURO = INTELIGENCIA, CLARO = ACCIÓN.
 * El cuerpo de la tarjeta es oscuro porque es análisis. El único
 * elemento claro es el botón: lo que hay que hacer.
 */

const clp = v => {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return null
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

const URGENCIA = {
  now: 'AHORA',
  today: 'HOY',
  week: 'ESTA SEMANA',
}

/** La tarjeta grande: una por pantalla. */
export function Oportunidad({ item, onAccion, onVerCliente }) {
  if (!item) return null

  const { ritmo = {}, productos = [], perfil = {} } = item
  const monto = clp(item.monto)
  const urgencia = URGENCIA[item.attention] || 'HOY'

  return (
    <article className={`bs-op att-${item.attention || 'today'}`}>
      <div className="bs-op-head">
        <span className="bs-op-urgencia">{urgencia}</span>
        {monto && (
          <span className="bs-op-monto">
            {monto}
            {/* Un monto estimado por fórmula y uno calculado sobre líneas
                reales no valen lo mismo. Decirlo evita que el vendedor
                confíe de más en una proyección. */}
            {!item.montoEsReal && <em> aprox.</em>}
          </span>
        )}
      </div>

      <h2 className="bs-op-cliente">{item.title}</h2>
      <p className="bs-op-ritmo">{ritmo.texto || item.reason}</p>

      {productos.length > 0 && (
        <ul className="bs-op-productos">
          {productos.map((p, i) => (
            <li key={p.sku || i} className="bs-op-prod">
              <span className="bs-op-prod-nom">{p.nombre}</span>
              <span className="bs-op-prod-cant">{p.cantidad}</span>
              <span className="bs-op-prod-precio">
                {clp(p.precio) || '—'}
                {/* Si el precio no es el suyo, hay que decirlo: llegar con
                    un número que el cliente no reconoce cuesta la venta. */}
                {p.precio != null && !p.precioEsDelCliente && <em> lista</em>}
              </span>
              {p.hayStock === false && <span className="bs-op-sinstock">sin stock</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="bs-op-acciones">
        <button type="button" className="bs-op-cta" onClick={() => onAccion?.(item)}>
          {perfil.etiquetaAccion === 'Llamar' ? 'LLAMAR' : 'CONTACTAR'}
        </button>
        <button type="button" className="bs-op-link" onClick={() => onVerCliente?.(item)}>
          Ver cliente
        </button>
      </div>
    </article>
  )
}

/** Las que siguen: una línea cada una, con su valor en $. */
export function OportunidadMini({ item, onAccion }) {
  if (!item) return null
  const monto = clp(item.monto)
  return (
    <button type="button" className="bs-opm" onClick={() => onAccion?.(item)}>
      <span className="bs-opm-info">
        <strong className="bs-opm-cliente">{item.title}</strong>
        <span className="bs-opm-razon">{item.ritmo?.texto || item.reason}</span>
      </span>
      {monto && <span className="bs-opm-monto">{monto}</span>}
    </button>
  )
}

export default Oportunidad