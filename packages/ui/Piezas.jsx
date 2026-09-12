import { Icono } from './Armazon.jsx'

/** Título de página con estado a la derecha. */
export function Titular({ titulo, bajada, estado }) {
  return (
    <header className="titular">
      <div>
        <h1>{titulo}</h1>
        {bajada && <p>{bajada}</p>}
      </div>
      {estado && <span className="chip-estado"><i /> {estado}</span>}
    </header>
  )
}

/**
 * Tarjeta de KPI.
 *
 * `valor` llega YA FORMATEADO. La tarjeta no sabe de pesos ni de
 * porcentajes: si supiera, cada app la formatearía distinto.
 */
export function Kpi({ icono, etiqueta, valor, variacion, nota, tono, onClick }) {
  const dir = variacion?.dir
  return (
    <div className={`kpi${tono ? ' ' + tono : ''}${onClick ? ' pulsable' : ''}`}
         onClick={onClick} role={onClick ? 'button' : undefined}
         tabIndex={onClick ? 0 : undefined}
         onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}>
      <p className="kpi-cabeza">
        {icono && <span className="kpi-icono"><Icono nombre={icono} size={15} /></span>}
        {etiqueta}
      </p>
      <p className="kpi-valor">{valor}</p>
      {(variacion || nota) && (
        <p className="kpi-pie">
          {variacion && (
            <span className={`var ${dir}`}>
              {dir === 'sube' ? '↑' : dir === 'baja' ? '↓' : '→'} {variacion.texto}
            </span>
          )}
          {nota && <span className="kpi-nota">{nota}</span>}
        </p>
      )}
    </div>
  )
}

export const Rejilla = ({ children }) => <div className="rejilla-kpi">{children}</div>

/**
 * Foco: problema → impacto → acción.
 *
 * `accion` es obligatoria a propósito. Un problema sin botón es
 * decoración: el gerente lee "12 clientes cayendo" y no puede hacer
 * nada con eso sin salir a buscarlos a mano.
 */
export function Foco({ severidad = 'aviso', titulo, detalle, impacto, accion, onAccion }) {
  return (
    <article className={`foco ${severidad}`}>
      <span className="foco-icono">
        <Icono nombre={severidad === 'critico' ? 'alerta' : severidad === 'logro' ? 'venta' : 'alerta'} size={19} />
      </span>
      <div className="foco-cuerpo">
        <p className="foco-titulo">{titulo}</p>
        {detalle && <p className="foco-detalle">{detalle}</p>}
        {impacto && <p className="foco-impacto">{impacto}</p>}
      </div>
      <button className={`boton-foco ${severidad}`} onClick={onAccion}>
        {accion} <span aria-hidden="true">→</span>
      </button>
    </article>
  )
}

/** Estados de negocio. Los mismos nombres en las cuatro apps. */
export function Insignia({ estado, texto }) {
  return <span className={`insignia ${estado}`}><i /> {texto}</span>
}

/**
 * Puntaje de salud 0-100.
 *
 * Los cortes son 80 y 60 y están acá, en un solo lugar: si cada
 * pantalla eligiera el suyo, el mismo 71 sería "bueno" en una y
 * "atención" en otra.
 */
export function Salud({ puntaje }) {
  const n = Math.max(0, Math.min(100, Number(puntaje) || 0))
  const nivel = n >= 80 ? 'ok' : n >= 60 ? 'aviso' : 'mal'
  const texto = n >= 80 ? 'Bueno' : n >= 60 ? 'Atención' : 'Crítico'
  return (
    <span className="salud" title={`${n} de 100 · ${texto}`}>
      <b className={nivel}>{n}</b>
      <span className="salud-barra"><i className={nivel} style={{ width: `${n}%` }} /></span>
    </span>
  )
}

/** Qué hacer cuando no hay nada que mostrar. */
export const Vacio = ({ titulo, detalle, accion, onAccion }) => (
  <div className="vacio">
    <p className="vacio-titulo">{titulo}</p>
    {detalle && <p className="vacio-detalle">{detalle}</p>}
    {accion && <button className="boton primario" onClick={onAccion}>{accion}</button>}
  </div>
)

export const Panel = ({ titulo, bajada, accion, children }) => (
  <section className="panel">
    {(titulo || accion) && (
      <div className="panel-titulo">
        <div>
          {titulo && <h2>{titulo}</h2>}
          {bajada && <p className="silencio">{bajada}</p>}
        </div>
        {accion}
      </div>
    )}
    {children}
  </section>
)

/** Barra de filtros. La misma en todas las pantallas que filtran. */
export function Filtros({ campos, valores, onCambiar }) {
  return (
    <div className="filtros">
      {campos.map((c) => (
        <label key={c.id} className="filtro">
          <span>{c.etiqueta}</span>
          <select value={valores[c.id] ?? ''} onChange={(e) => onCambiar(c.id, e.target.value)}>
            {c.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>{o.texto}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
