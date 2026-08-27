/**
 * Cliente de TanStack Query afinado para uso en terreno.
 *
 * POR QUÉ NO LOS DEFAULTS
 * Los defaults de TanStack asumen una oficina con fibra: reintentan 3 veces
 * sin importar el error y consideran los datos obsoletos al instante. Acá el
 * usuario es un vendedor en un pasillo de supermercado con una barra de señal.
 *
 * Las decisiones concretas:
 *
 * - `retry` NO reintenta errores de PostgREST que son culpa nuestra (42703 =
 *   columna inexistente, 42P01 = tabla inexistente, y todo lo 4xx salvo 408 y
 *   429). Reintentar un `42703` tres veces no arregla el esquema: sólo demora
 *   el mensaje de error tres veces más. Es exactamente la clase de bug que
 *   `explainError` existe para hacer visible.
 * - `staleTime` de 30 s: en terreno se navega entre pantallas todo el tiempo
 *   (Hoy → Visita → Hoy). Sin esto, cada vuelta atrás dispara la consulta de
 *   nuevo y quema datos móviles del vendedor.
 * - `gcTime` de 24 h: la caché sobrevive a la jornada. Volver a una pantalla
 *   sin señal muestra lo último conocido en vez de una pantalla vacía.
 * - `refetchOnWindowFocus` apagado: en un móvil el foco se pierde y recupera
 *   constantemente (notificaciones, cambiar de app). Con el default, cada
 *   vuelta a la app dispara una ráfaga de consultas.
 * - `refetchOnReconnect` encendido: éste sí es el evento que importa. Al
 *   recuperar señal queremos datos frescos.
 * - `networkMode: 'offlineFirst'`: intenta igual aunque el navegador se crea
 *   sin conexión. `navigator.onLine` miente seguido (da true con WiFi de
 *   portal cautivo, y false en algunos WebView).
 */
import { QueryClient } from '@tanstack/react-query'

/** Códigos de PostgREST donde reintentar no puede ayudar: el problema es el request. */
const ERRORES_SIN_REINTENTO = new Set([
  '42703', // columna inexistente — esquema desalineado
  '42P01', // tabla inexistente
  '42501', // permiso denegado (RLS)
  '22P02', // sintaxis de entrada inválida
  '23505', // duplicado
  'PGRST116', // no se encontró la fila
  'PGRST301', // JWT inválido / expirado
])

/**
 * @param {unknown} error
 * @returns {boolean} true si reintentar tiene alguna chance de funcionar
 */
export function valeLaPenaReintentar(error) {
  const e = /** @type {any} */ (error)
  if (!e) return true

  const code = String(e.code ?? '')
  if (ERRORES_SIN_REINTENTO.has(code)) return false

  // HTTP 4xx: el request está mal formado o no autorizado. Salvo 408
  // (timeout) y 429 (rate limit), que sí se destraban solos.
  const status = Number(e.status ?? e.statusCode ?? 0)
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false

  return true
}

/**
 * @param {number} intentos
 * @param {unknown} error
 * @returns {boolean}
 */
export function politicaDeReintento(intentos, error) {
  if (!valeLaPenaReintentar(error)) return false
  return intentos < 2
}

/** Backoff exponencial con tope, igual en espíritu al del outbox. */
export function esperaDeReintento(intentos) {
  return Math.min(1000 * 2 ** intentos, 30_000)
}

export function crearQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: politicaDeReintento,
        retryDelay: esperaDeReintento,
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Las escrituras NO se reintentan acá: para eso está el outbox, que
        // es durable y sobrevive al cierre de la app. Un reintento en memoria
        // daría la falsa impresión de que la escritura está protegida.
        retry: false,
        networkMode: 'offlineFirst',
      },
    },
  })
}