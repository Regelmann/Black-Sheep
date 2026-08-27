/**
 * Escritura optimista con reversión automática.
 *
 * EL PROBLEMA QUE RESUELVE
 * Hoy cada guardado hace `await supabase...` y recién después actualiza la
 * pantalla. En una oficina eso son 80 ms y no se nota. En un pasillo de
 * supermercado con una barra de señal son 2 a 5 segundos en los que el
 * vendedor ve un spinner y no sabe si su cambio se guardó.
 *
 * La sensación de velocidad de una app de primera línea no viene de que el
 * servidor responda rápido: viene de que **la interfaz no espera al
 * servidor**. Se aplica el cambio de inmediato, se manda al servidor en
 * segundo plano, y si falla se revierte mostrando por qué.
 *
 * POR QUÉ CON ROLLBACK Y NO "OPTIMISTA A SECAS"
 * Optimismo sin reversión es mentirle al usuario: le decís que guardaste y no
 * guardaste. Este hook toma una foto de la caché antes de tocarla y la
 * restaura si el servidor rechaza. El usuario ve su cambio al instante y, si
 * algo sale mal, ve cómo se deshace junto con el motivo — que es honesto.
 *
 * CUÁNDO **NO** USAR ESTO
 * Para acciones de terreno que no pueden perderse (cerrar una visita, tomar
 * un pedido) va el **outbox**, que es durable y sobrevive a que se cierre la
 * app. Este hook es para ediciones de escritorio —corregir una comuna,
 * ajustar un precio— donde el usuario está mirando y puede reintentar.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { explainError } from '../lib/query.js'

/**
 * @param {object} opts
 * @param {readonly unknown[]} opts.clave          queryKey de la lista a parchar
 * @param {(vars:any)=>Promise<any>} opts.enviar   llamada real al servidor
 * @param {(previo:any[], vars:any)=>any[]} opts.aplicar  cómo se ve la lista ya guardada
 * @param {(msg:string)=>void} [opts.alFallar]     aviso al usuario si se revierte
 * @param {(vars:any)=>void} [opts.alLograr]       confirmación discreta
 */
export function useGuardar({ clave, enviar, aplicar, alFallar, alLograr }) {
  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: enviar,

    async onMutate(vars) {
      // Se cancelan las consultas en vuelo: si una respuesta vieja llegara
      // después de aplicar el cambio, pisaría lo que el usuario acaba de
      // escribir y parecería que el guardado "se deshizo solo".
      await qc.cancelQueries({ queryKey: clave })

      const previo = qc.getQueryData(clave)
      qc.setQueryData(clave, (actual = []) => aplicar(actual, vars))

      // Devolver el estado previo es lo que hace posible revertir.
      return { previo }
    },

    onError(error, _vars, contexto) {
      if (contexto?.previo !== undefined) qc.setQueryData(clave, contexto.previo)
      const info = explainError(error)
      alFallar?.(info.user)
    },

    onSuccess(_data, vars) {
      alLograr?.(vars)
    },

    onSettled() {
      // Se revalida contra el servidor pase lo que pase: el optimismo es una
      // predicción, no una verdad. Si el servidor normalizó algo (mayúsculas,
      // un trigger), acá se corrige sin que el usuario haga nada.
      qc.invalidateQueries({ queryKey: clave })
    },
  })

  return {
    guardar: m.mutate,
    guardando: m.isPending,
    /** Identifica QUÉ fila se está guardando, para el estado visual por fila. */
    variables: m.variables,
  }
}