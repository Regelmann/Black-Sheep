/**
 * Puente entre TanStack Query y `safeSelect`.
 *
 * EL CHOQUE DE CONTRATOS QUE ESTE HOOK RESUELVE
 * `safeSelect` está construido para NO lanzar nunca: devuelve
 * `{ok:false, error}` y deja que la pantalla decida. Ese diseño es correcto y
 * es lo que evita pantallas en blanco.
 *
 * Pero TanStack detecta el fracaso de una consulta justamente porque la
 * `queryFn` lanza. Si le pasáramos `safeSelect` tal cual, **toda consulta
 * fallida se cachearía como éxito**: sin reintento, sin `isError`, y con el
 * error guardado 24 h en la caché. El vendedor vería una tabla vacía en vez
 * de "no hay señal".
 *
 * `useDatos` traduce: corre `safeSelect`, y si `ok` es false lanza un error
 * que conserva el `code` de PostgREST —para que la política de reintento
 * pueda distinguir un 42703 de una caída de red— y el texto ya traducido por
 * `explainError` para mostrarle al usuario.
 *
 * Devuelve la MISMA forma que las pantallas ya consumen (`rows`, `error`,
 * `loading`), así que migrar una pantalla no obliga a reescribir su JSX.
 */
import { useQuery } from '@tanstack/react-query'
import { safeSelect, DATA_STATE } from '../lib/query.js'

/** Error de datos que sí lanza, preservando lo que la política necesita leer. */
export class ErrorDeDatos extends Error {
  /**
   * @param {{user?: string, dev?: string, code?: string}} info
   * @param {string} label
   */
  constructor(info, label) {
    super(info?.dev || info?.user || `fallo la consulta ${label}`)
    this.name = 'ErrorDeDatos'
    /** Texto apto para mostrarle a un vendedor. */
    this.user = info?.user || 'No se pudieron cargar los datos.'
    /** Código de PostgREST: lo lee `valeLaPenaReintentar`. */
    this.code = info?.code
    this.label = label
  }
}

/**
 * @param {object} opts
 * @param {readonly unknown[]} opts.clave     queryKey; cambiarla vuelve a consultar
 * @param {() => any} opts.construir          arma el builder de supabase (lazy)
 * @param {string} [opts.label]               etiqueta para los logs
 * @param {any[]} [opts.fallback]             filas a mostrar si falla
 * @param {boolean} [opts.activa]             false = no consultar todavía
 * @param {number} [opts.frescura]            ms antes de considerarlo obsoleto
 */
export function useDatos({
  clave,
  construir,
  label = 'query',
  fallback = [],
  activa = true,
  frescura,
}) {
  const q = useQuery({
    queryKey: clave,
    enabled: activa,
    ...(frescura === undefined ? {} : { staleTime: frescura }),
    queryFn: async () => {
      const r = await safeSelect(construir(), { label, fallback })
      // Acá está la traducción de contratos: safeSelect no lanza, TanStack
      // necesita que se lance. Sin esto, un fallo se cachea como éxito.
      if (!r.ok) throw new ErrorDeDatos(r.error || {}, label)
      return r.rows
    },
  })

  const err = /** @type {any} */ (q.error)

  return {
    rows: q.data ?? fallback,
    loading: q.isPending && activa,
    /** Hay datos en pantalla pero se están revalidando en segundo plano. */
    revalidando: q.isFetching && !q.isPending,
    error: q.isError ? { user: err?.user || String(err?.message || err), code: err?.code } : null,
    estado: q.isPending
      ? DATA_STATE.LOADING
      : q.isError
        ? DATA_STATE.ERROR
        : (q.data?.length ?? 0)
          ? DATA_STATE.READY
          : DATA_STATE.EMPTY,
    refrescar: q.refetch,
  }
}