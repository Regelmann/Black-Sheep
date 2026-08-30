/**
 * TRAER TODO — el techo de 1.000 filas de PostgREST.
 *
 * 🔴 EL BUG
 * La app mostraba 917 / 462 / 1.000 prospectos cuando la base tiene
 * 2.389 / 3.870 / 3.627. El **1.000 redondo** delata la causa:
 *
 *   PostgREST corta en 1.000 filas por defecto (db-max-rows), y
 *   `.limit(5000)` NO sube ese tope. El límite del cliente sólo puede
 *   BAJAR el del servidor, nunca subirlo.
 *
 * Lo peor: no falla. La respuesta es un 200 con menos filas. No hay
 * error, no hay warning, y el vendedor ve una lista plausible a la que
 * le faltan dos tercios de su cartera.
 *
 * Es el mismo patrón que ya nos costó caro tres veces: un fallo que se
 * ve idéntico a un resultado legítimo.
 *
 * LA SALIDA
 * Paginar con .range() hasta que una página vuelva incompleta.
 */
import { safeSelect } from './query.js'

/** Tope real del servidor. Pedir más por página no sirve de nada. */
export const PAGINA = 1000

/**
 * Trae TODAS las filas, sin importar el techo del servidor.
 *
 * @param {(desde:number, hasta:number) => PromiseLike<any>} construir
 *        recibe el rango y devuelve el query builder ya armado
 * @param {{ label?: string, maxPaginas?: number }} [opts]
 * @returns {Promise<{ rows: any[], ok: boolean, error: any, paginas: number, truncado: boolean }>}
 *
 * @example
 *   const r = await traerTodo(
 *     (d, h) => supabase.from('prospectos').select('*')
 *                 .eq('zona', zona)
 *                 .order('score', { ascending: false, nullsFirst: false })
 *                 .range(d, h),
 *     { label: 'prospectos' }
 *   )
 */
export async function traerTodo(construir, opts = {}) {
  const { label = 'query', maxPaginas = 20 } = opts
  const filas = []
  let paginas = 0

  for (let i = 0; i < maxPaginas; i++) {
    const desde = i * PAGINA
    const hasta = desde + PAGINA - 1

    const r = await safeSelect(construir(desde, hasta), { label: `${label}[p${i}]` })
    paginas++

    if (!r.ok) {
      // Si la PRIMERA página falla, no hay datos y hay que decirlo.
      // Si falla una posterior, se devuelve lo que se alcanzó a traer
      // marcado como incompleto: media cartera es mejor que ninguna,
      // pero el llamador tiene que saber que está incompleta.
      return {
        rows: filas,
        ok: filas.length > 0,
        error: r.error,
        paginas,
        truncado: filas.length > 0,
      }
    }

    filas.push(...r.rows)

    // Página incompleta = era la última. Es la única señal confiable:
    // el servidor no dice cuántas filas hay en total.
    if (r.rows.length < PAGINA) {
      return { rows: filas, ok: true, error: null, paginas, truncado: false }
    }
  }

  // Se agotaron las páginas permitidas. Con PAGINA=1000 y maxPaginas=20
  // son 20.000 filas: si se llega acá, algo está mal en el filtro.
  console.warn(
    `[${label}] se alcanzó el tope de ${maxPaginas} páginas ` +
    `(${filas.length} filas). Puede haber más sin traer.`
  )
  return { rows: filas, ok: true, error: null, paginas, truncado: true }
}

/**
 * ¿Este resultado huele a truncado por el servidor?
 *
 * Un conteo exactamente igual al tope es casi siempre una lista cortada,
 * no una coincidencia. Sirve para detectar consultas que todavía no
 * migraron a traerTodo().
 */
export function pareceTruncado(n) {
  return n === PAGINA || n === 500 || n === 100
}
