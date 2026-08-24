import { money } from '../components.jsx'

/**
 * Gerencia en 15 segundos — atención, causa, acción.
 */
export default function ExecutivePulse({ gerencia = [], pred7 = null, totalVenta = 0, pctTerreno = 0 }) {
  const zonas = (gerencia || [])
    .filter(g => g && (g.ejecutivo || g.zona))
    .map(g => {
      const venta = Number(g.venta_mtd || g.venta || 0)
      const meta = Number(g.meta_mensual || g.meta || 0)
      const pct = meta > 0 ? Math.round((venta / meta) * 100) : null
      const nombre = g.ejecutivo || g.zona || '—'
      return { nombre, venta, meta, pct, brecha: Math.max(0, meta - venta) }
    })
    .filter(z => z.meta > 0 || z.venta > 0)

  const peores = [...zonas].filter(z => z.pct != null).sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999))
  const mejores = [...zonas].filter(z => z.pct != null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
  const atencion = peores[0]
  const top = mejores[0]

  const riesgo = pred7?.ventaEnRiesgo || 0
  const oport = pred7?.oportunidad || 0
  const esperada = pred7?.ventaEsperada || 0

  return (
    <section className="bs-exec-pulse" aria-label="Executive pulse">
      <div className="bs-exec-pulse-head">
        <span className="bs-exec-kicker">Executive Pulse</span>
        <span className="bs-exec-sub">15 segundos · qué importa ahora</span>
      </div>

      <div className="bs-exec-hero-nums">
        <div>
          <em>Venta MTD</em>
          <strong>{money(totalVenta)}</strong>
        </div>
        <div>
          <em>Ritmo terreno</em>
          <strong className={pctTerreno >= 70 ? 'ok' : pctTerreno >= 40 ? 'mid' : 'low'}>{pctTerreno}%</strong>
        </div>
        {esperada > 0 && (
          <div>
            <em>7d esperada</em>
            <strong className="ok">{money(esperada)}</strong>
          </div>
        )}
      </div>

      <div className="bs-exec-blocks">
        {atencion && atencion.pct != null && atencion.pct < 85 && (
          <article className="bs-exec-block danger">
            <span className="bs-exec-tag">ATENCIÓN</span>
            <h3>{atencion.nombre}</h3>
            <p>
              {atencion.pct}% de meta · brecha {money(atencion.brecha)}
            </p>
            <p className="bs-exec-cause">
              Revisá mix y clientes activos · priorizar reposición en esta zona
            </p>
          </article>
        )}

        {riesgo > 0 && (
          <article className="bs-exec-block warn">
            <span className="bs-exec-tag">RIESGO 7D</span>
            <h3>{money(riesgo)}</h3>
            <p>
              {(pred7?.clientesEnRiesgo || []).length || '—'} clientes en riesgo recuperable
            </p>
          </article>
        )}

        {oport > 0 && (
          <article className="bs-exec-block opp">
            <span className="bs-exec-tag">OPORTUNIDAD</span>
            <h3>{money(oport)}</h3>
            <p>Clientes con ventana de compra esta semana</p>
          </article>
        )}

        {top && top.pct != null && top.pct >= 85 && (
          <article className="bs-exec-block ok">
            <span className="bs-exec-tag">MEJOR</span>
            <h3>{top.nombre}</h3>
            <p>{top.pct}% de meta · {money(top.venta)}</p>
          </article>
        )}
      </div>

      {pred7?.resumen && (
        <p className="bs-exec-resumen">{pred7.resumen}</p>
      )}
    </section>
  )
}
