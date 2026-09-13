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

/**
 * Lista de pasos de puesta en marcha.
 *
 * El número va en su propia columna. Antes iba pegado al texto y
 * "2Usuarios con acceso" se leía como «2 usuarios», que es justo lo
 * contrario de lo que dice: que no hay ninguno.
 */
export function Pasos({ pasos }) {
  return (
    <ol className="pasos-alta">
      {pasos.map((p, i) => (
        <li key={i} className={`paso-alta ${p.hecho ? 'hecho' : 'pendiente'}`}>
          <span className="marcador" aria-hidden="true">{p.hecho ? '✓' : i + 1}</span>
          <span className="paso-texto">
            <b>{p.titulo}</b>
            <span className="silencio">{p.detalle}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Pares etiqueta/valor. Reemplaza tablas de dos columnas. */
export const Datos = ({ filas }) => (
  <dl className="datos-lista">
    {filas.map((f, i) => (
      <div key={i}>
        <dt>{f.k}</dt>
        <dd className={f.tono || ''}>{f.v}</dd>
      </div>
    ))}
  </dl>
)

/** Acciones al pie de un panel. */
export const Acciones = ({ children }) => <div className="acciones-panel">{children}</div>


/**
 * Estado del cliente · el MISMO lenguaje en terreno y en gerencia.
 *
 * Los nombres salen de `core.estado_cliente` y de `estado_fuga`: si la
 * pantalla inventara los suyos, el vendedor y el jefe hablarían de
 * cosas distintas mirando el mismo cliente.
 */
const ESTADOS = {
  activo:       { texto: 'Al día',      tono: 'ok' },
  al_dia:       { texto: 'Al día',      tono: 'ok' },
  enfriandose:  { texto: 'Enfriándose', tono: 'aviso' },
  atrasado:     { texto: 'Atrasado',    tono: 'aviso' },
  en_riesgo:    { texto: 'En riesgo',   tono: 'aviso' },
  en_fuga:      { texto: 'En fuga',     tono: 'mal' },
  dormido:      { texto: 'Dormido',     tono: 'mal' },
  perdido:      { texto: 'Perdido',     tono: 'mal' },
  fugado:       { texto: 'Fugado',      tono: 'mal' },
  bloqueado:    { texto: 'Bloqueado',   tono: 'mal' },
  nunca_compro: { texto: 'Nunca compró', tono: '' },
  sin_ritmo:    { texto: 'Sin ritmo',   tono: '' },
}

export function EstadoCliente({ estado }) {
  const e = ESTADOS[estado]
  if (!e) return null
  return <Insignia estado={e.tono} texto={e.texto} />
}

/** Avance contra una meta. Se corta visualmente en 100%. */
export function Barra({ valor, meta, etiqueta }) {
  const pct = meta > 0 ? Math.min(100, (Number(valor) / Number(meta)) * 100) : 0
  const tono = pct >= 100 ? 'ok' : pct >= 70 ? 'aviso' : 'mal'
  return (
    <div className="barra">
      {etiqueta && <p className="barra-etiqueta">{etiqueta}</p>}
      <span className="barra-fondo">
        <i className={tono} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
