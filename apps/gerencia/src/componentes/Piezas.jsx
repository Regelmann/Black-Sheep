import { clp, corto, pct } from '../lib/formato.js'

export function Dato({ etiqueta, valor, pie, tono }) {
  const nd = valor === null || valor === undefined
  return (
    <div className="panel dato">
      <span className="etiqueta">{etiqueta}</span>
      <span className={`cifra ${nd ? 'nd' : tono || ''}`}>{nd ? 'No disponible' : valor}</span>
      {pie ? <span className="pie">{pie}</span> : null}
    </div>
  )
}

export function Insignia({ tono = 'neutra', children }) {
  return <span className={`insignia ${tono}`}>{children}</span>
}

const TONO_ESTADO = {
  activo: 'ok', enfriandose: 'ojo', en_riesgo: 'ojo',
  dormido: 'mal', fugado: 'mal', bloqueado: 'neutra', nunca_compro: 'neutra',
}
const NOMBRE_ESTADO = {
  activo: 'Activo', enfriandose: 'Enfriándose', en_riesgo: 'En riesgo',
  dormido: 'Dormido', fugado: 'Fugado', bloqueado: 'Bloqueado', nunca_compro: 'Nunca compró',
}
export const EstadoCliente = ({ estado }) => (
  <Insignia tono={TONO_ESTADO[estado] || 'neutra'}>{NOMBRE_ESTADO[estado] || estado}</Insignia>
)

export function Barra({ valor, meta }) {
  const p = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0
  return (
    <div>
      <div className="barra-fondo"><div className="barra-relleno" style={{ width: `${p}%` }} /></div>
      <span className="silencio">{corto(valor)} de {corto(meta)} · {pct(p, 0)}</span>
    </div>
  )
}

export function Panel({ titulo, accion, children }) {
  return (
    <section className="panel">
      {titulo ? (
        <div className="panel-titulo">
          <h2>{titulo}</h2>
          {accion}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Moneda({ n }) {
  const v = Number(n)
  return <span className={v < 0 ? 'cifra neg' : ''}>{clp(n)}</span>
}
