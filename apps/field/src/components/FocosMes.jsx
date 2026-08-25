/**
 * FocosMes — avance de los focos del mes.
 *
 * Rescatado de pages/Metas.jsx, que era código muerto: nadie la importaba
 * y la ruta /metas redirigía a "/". Lo único que esa página aportaba y no
 * estaba en ningún otro lado era esta vista de focos con barra de avance.
 *
 * Metas.jsx calculaba el porcentaje inline:
 *   const pct = metaU ? Math.round((vendido / metaU) * 100) : pctNum(f.pct_avance)
 *
 * Eso reproducía a mano lo que ya hace pctAvanceFoco(), que además normaliza
 * `pct_avance` cuando la bajada lo entrega como FRACCIÓN (0.7619 en vez de 76).
 * Acá se usa la función, no una copia.
 */
import { pctAvanceFoco, pctBar } from '../lib/utils'

function nombreFoco(f) {
  return (
    f?.producto_nombre ||
    f?.foco ||
    f?.nombre ||
    f?.sku_canon ||
    'Foco'
  )
}

function unidad(f) {
  const u = String(f?.unidad || f?.unidad_medida || '').trim()
  return u || 'un'
}

export function FocosMes({ focos = [], max = 5 }) {
  if (!focos.length) return null

  // Los más atrasados primero: son los que necesitan acción hoy.
  const orden = [...focos]
    .map((f) => ({ f, pct: pctAvanceFoco(f) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, max)

  return (
    <section className="bs-focos">
      <h3 className="bs-focos-title">Focos del mes</h3>

      {orden.map(({ f, pct }, i) => {
        const meta = Number(f?.meta_unidad ?? f?.meta_unidad_mes ?? 0)
        const vend = Number(f?.vendido_unidad ?? f?.vendido_unidad_mtd ?? 0)
        const falta = Math.max(0, meta - vend)
        const { background: color } = pctBar(pct)
        const u = unidad(f)

        return (
          <div className="bs-foco-row" key={f?.id ?? f?.sku_canon ?? i}>
            <div className="bs-foco-head">
              <span className="bs-foco-name">{nombreFoco(f)}</span>
              <span className="bs-foco-pct" style={{ color }}>{pct}%</span>
            </div>

            <div
              className="bs-foco-bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Avance de ${nombreFoco(f)}`}
            >
              <i style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
            </div>

            <p className="bs-foco-sub">
              {meta > 0
                ? <>
                    {vend.toLocaleString('es-CL')} / {meta.toLocaleString('es-CL')} {u}
                    {falta > 0 && <> · faltan {falta.toLocaleString('es-CL')} {u}</>}
                    {pct >= 100 && <> · logrado</>}
                  </>
                : 'Sin meta definida para este foco'}
            </p>
          </div>
        )
      })}
    </section>
  )
}

export default FocosMes
