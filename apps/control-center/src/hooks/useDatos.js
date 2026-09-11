/**
 * Puente entre TanStack Query y `safeSelect`.
 *
 * EL CHOQUE DE CONTRATOS QUE RESUELVE (heredado de la 15.3, textual):
 * `safeSelect` está hecho para NO lanzar nunca. Ese diseño es correcto y
 * es lo que evita pantallas en blanco. Pero TanStack detecta el fracaso
 * de una consulta justamente porque la queryFn lanza. Si le pasáramos
 * `safeSelect` tal cual, toda consulta fallida se cachearía como éxito:
 * sin reintento, sin isError, con el error guardado en caché.
 *
 * `useDatos` traduce: corre safeSelect y, si ok es false, lanza un error
 * que conserva el `code` de PostgREST y el texto ya traducido.
 */
import { useQuery } from '@tanstack/react-query'
import { safeSelect, DATA_STATE } from '../../../../packages/datos/query.js'

export class ErrorDeDatos extends Error {
  constructor(info, label) {
    super(info?.dev || info?.user || `falló la consulta ${label}`)
    this.name = 'ErrorDeDatos'
    this.user = info?.user || 'No se pudieron cargar los datos.'
    this.code = info?.code
    this.label = label
  }
}

export function useDatos({ clave, construir, label = 'consulta', fallback = [], activa = true, frescura }) {
  const q = useQuery({
    queryKey: clave,
    enabled: activa,
    ...(frescura === undefined ? {} : { staleTime: frescura }),
    queryFn: async () => {
      const r = await safeSelect(construir(), { label, fallback })
      if (!r.ok) throw new ErrorDeDatos(r.error || {}, label)
      return r.rows
    },
    retry: (intentos, err) => {
      // Una columna que no existe o un permiso denegado no aparecen por
      // reintentar. Sólo se reintenta lo que puede mejorar solo.
      if (['42703', '42501', 'PGRST301'].includes(err?.code)) return false
      return intentos < 2
    },
  })

  const err = q.error
  return {
    rows: q.data ?? fallback,
    loading: q.isPending && activa,
    revalidando: q.isFetching && !q.isPending,
    error: q.isError ? { user: err?.user || String(err?.message || err), code: err?.code } : null,
    estado: q.isPending ? DATA_STATE.LOADING
      : q.isError ? DATA_STATE.ERROR
      : (q.data?.length ?? 0) ? DATA_STATE.READY : DATA_STATE.EMPTY,
    refrescar: q.refetch,
  }
}
