/**
 * Tipos del dominio — los contratos que hasta ahora vivían en comentarios.
 *
 * POR QUÉ ESTE ARCHIVO
 * `flushActionQueue` acepta `boolean` o `{ok, error}` porque un handler que
 * devolvía `{ok:false}` —objeto truthy— borraba items de la cola como si se
 * hubieran subido. El contrato está documentado en español en tres lugares,
 * pero nada lo verifica: cada handler nuevo sigue siendo una apuesta.
 *
 * Acá se declara una vez y el compilador lo hace cumplir.
 */

/** Tipos de acción que la app encola sin señal. */
export type TipoAccion = 'checkin' | 'completar' | 'nota' | 'pedido' | 'no_venta'

/** Un item de la cola de terreno. */
export interface ItemOutbox {
  /** Igual a client_op_id. Clave primaria en IndexedDB. */
  id: string
  /**
   * Llave de idempotencia que viaja al servidor. Si el insert llegó pero la
   * respuesta se perdió, el reintento manda el MISMO id y el índice único lo
   * rechaza (23505) en vez de duplicar el dato.
   */
  client_op_id: string
  type: TipoAccion | string
  payload: Record<string, unknown>
  enqueuedAt: string
  attempts: number
  /** Epoch ms a partir del cual puede reintentarse (backoff exponencial). */
  nextAttemptAt?: number
  /** Agotó MAX_INTENTOS: espera decisión del usuario en la bandeja. */
  agotado?: boolean
  lastError?: string
}

/**
 * Lo que DEBE devolver un handler del outbox.
 *
 * Reglas que costaron incidentes:
 *  · `ok:false` → el item se queda en la cola y se reintenta.
 *  · `descartar:true` → item corrupto: sale de la cola (reintentarlo 25
 *    veces no lo arregla y bloquea a los que vienen detrás).
 *  · Un duplicado (23505) es `ok:true`: el dato YA está en la base.
 *  · Nunca `undefined`: la cola quedaría eterna.
 */
export interface ResultadoHandler {
  ok: boolean
  error?: string
  /** El dato ya existía por un intento anterior cuya respuesta se perdió. */
  yaExistia?: boolean
  /** Se subió sin columnas opcionales por un problema de esquema. */
  degraded?: boolean
  /** Payload inválido: sacar de la cola en vez de reintentar para siempre. */
  descartar?: boolean
  id?: string
}

export type HandlerOutbox = (item: ItemOutbox) => Promise<ResultadoHandler>

/** Mapa tipo → handler que consume flushActionQueue. */
export type MapaHandlers = Partial<Record<TipoAccion, HandlerOutbox>> &
  Record<string, HandlerOutbox | undefined>

/** Resultado de un drenaje de la cola. */
export interface ResultadoFlush {
  ok: number
  fail: number
  remaining: number
  /** Items que aún esperan su backoff: no se intentaron esta vuelta. */
  pospuestos?: number
  agotados?: number
}

/** Estado que expone el motor de sync a la UI. */
export type EstadoSync = 'offline' | 'success' | 'partial' | 'empty' | 'error'

/** Clasificación de un error de PostgREST, en criollo y en técnico. */
export interface ErrorExplicado {
  kind: 'schema' | 'permission' | 'network' | 'unknown'
  /** Mensaje para el vendedor. */
  user: string
  /** Mensaje para quien depura. */
  dev: string
}

/** Paleta de marca de un tenant. `logoUrl` es null mientras no tenga logo propio. */
export interface MarcaTenant {
  name: string
  accent: string
  accentDark: string
  accentSoft: string
  accentRing: string
  logoUrl: string | null
}

/** Cliente multi-tenant. `supabaseUrl`/`supabaseAnon` faltan si no hay env configurada. */
export interface Tenant {
  id: string
  name: string
  slug: string
  domains: string[]
  emailHints: string[]
  supabaseUrl: string | undefined
  supabaseAnon: string | undefined
  features: Record<string, boolean>
  brand: MarcaTenant
}