/**
 * seguridad.js — autorización, validación de tokens y saneamiento.
 *
 * POR QUÉ EXISTE
 * --------------
 * La seguridad de la app estaba ESPARCIDA y era implícita:
 *
 *   · El rol se calculaba en App.jsx con una comparación de strings
 *     repetida en cuatro archivos (App.jsx, Gerencia, Admin, NavBar).
 *     Si un quinto lugar la reescribe distinto, la app decide dos cosas
 *     distintas sobre quién es admin.
 *   · El token del catálogo público se mandaba al RPC tal cual venía de
 *     la URL. Cualquier basura llegaba hasta Postgres.
 *   · Los errores se registraban con `console.error(error)` completo:
 *     headers, tokens y datos de clientes en la consola del teléfono.
 *
 * Acá hay UNA definición de cada una, pura y testeable — como el resto
 * de `lib/`. Las reglas que dependen del servidor (RLS) siguen siendo la
 * defensa real: esto es defensa en profundidad, no un reemplazo.
 *
 * REGLA: este módulo NO importa React ni supabase. Es puro.
 */

/* ============================================================
   1 · ROLES Y AUTORIZACIÓN
   ============================================================ */

/** Roles con acceso a Gerencia / Admin / Control Center. */
export const ROLES_ADMIN = Object.freeze(['superadmin', 'gerente', 'admin'])

/**
 * ¿Este perfil puede administrar?
 *
 * Se normaliza SIEMPRE: la base tiene 'GERENTE', 'Admin' y 'ejecutivo'
 * mezclados, y `ejecutivos.rol` llegó con mayúsculas de una carga del
 * ETL. Comparar sin normalizar da falsos negativos y, peor, falsos
 * positivos cuando el rol llega con espacios.
 *
 * @param {{ rol?: string, esSuperAdmin?: boolean }|null|undefined} ejecutivo
 * @returns {boolean}
 */
export function esAdmin(ejecutivo) {
  if (!ejecutivo) return false
  // `esSuperAdmin` lo calcula App.jsx al armar el contexto. Se respeta
  // para no romper a quien ya lo consume, pero el rol es la fuente.
  if (ejecutivo.esSuperAdmin === true) return true
  return ROLES_ADMIN.includes(String(ejecutivo.rol || '').trim().toLowerCase())
}

/**
 * ¿Puede ver los datos de OTRA zona / ejecutivo?
 * Un ejecutivo ve sólo lo suyo. Un admin ve todo su tenant.
 *
 * @param {object|null} ejecutivo
 * @param {string|null|undefined} zonaPropia  zona del perfil
 * @param {string|null|undefined} zonaPedida  zona que se quiere ver
 * @returns {boolean}
 */
export function puedeVerZona(ejecutivo, zonaPropia, zonaPedida) {
  if (esAdmin(ejecutivo)) return true
  if (!zonaPropia || !zonaPedida) return false
  return String(zonaPropia).trim().toLowerCase() === String(zonaPedida).trim().toLowerCase()
}

/**
 * ¿Puede operar sobre el registro de OTRO ejecutivo?
 * (escribir una visita, un pedido, una nota a nombre de un tercero).
 *
 * @param {object|null} ejecutivo
 * @param {string|null|undefined} ejecutivoDueno  id del autor del registro
 * @returns {boolean}
 */
export function puedeOperarSobre(ejecutivo, ejecutivoDueno) {
  if (esAdmin(ejecutivo)) return true
  if (!ejecutivo?.id || !ejecutivoDueno) return false
  return String(ejecutivo.id) === String(ejecutivoDueno)
}

/* ============================================================
   2 · TOKENS DEL CATÁLOGO PÚBLICO
   ============================================================ */

/**
 * Formato del token: 18 bytes aleatorios en hex → 36 caracteres.
 * Se acepta un rango porque tokens generados antes de V14.7 pueden
 * tener otro largo. Lo que se RECHAZA es lo que no es hex: comillas,
 * espacios, `%`, rutas y cualquier cosa que venga pegada en la URL.
 */
const TOKEN_RE = /^[0-9a-f]{24,64}$/i

/**
 * ¿Este string puede ser un token de catálogo?
 *
 * Es la PRIMERA barrera, en el cliente. La que decide es la base:
 * `get_public_catalogo()` valida existencia y vigencia. Acá sólo se
 * evita mandar por la red algo que no es un token — un enlace armado
 * con `?token=` y cualquier texto, o un path traversal disfrazado.
 *
 * @param {unknown} token
 * @returns {boolean}
 */
export function esTokenCatalogo(token) {
  if (typeof token !== 'string') return false
  const t = token.trim()
  if (t.length < 24 || t.length > 64) return false
  return TOKEN_RE.test(t)
}

/**
 * Normaliza un token leído de la URL: sin espacios, sin barras, minúsculas.
 * Devuelve null si no califica — NUNCA devuelve la entrada cruda.
 *
 * @param {unknown} token
 * @returns {string|null}
 */
export function tokenCatalogoSeguro(token) {
  return esTokenCatalogo(token) ? String(token).trim().toLowerCase() : null
}

/* ============================================================
   3 · SESIÓN
   ============================================================ */

/**
 * ¿La sesión ya venció?
 *
 * Importa porque el teléfono es COMPARTIDO y se pierde: sin esto, un
 * equipo encontrado abre la app y muestra la cartera completa de la
 * empresa sin pedir credenciales. Supabase refresca solo
 * (`autoRefreshToken: true`), así que una sesión vencida en runtime es
 * la excepción, no la regla — y justo por eso merece atención.
 *
 * @param {{ expires_at?: number }|null|undefined} session
 * @param {number} [ahora]  timestamp en SEGUNDOS (como lo entrega Supabase)
 * @returns {boolean}
 */
export function sesionExpirada(session, ahora) {
  if (!session) return true
  const exp = Number(session.expires_at)
  if (!Number.isFinite(exp) || exp <= 0) return false // sin dato: no inventar un cierre
  const t = typeof ahora === 'number' ? ahora : Math.floor(Date.now() / 1000)
  return t >= exp
}

/* ============================================================
   4 · SANEAMIENTO Y LOGS
   ============================================================ */

/** Escapa los cinco caracteres que importan antes de meter texto en HTML. */
export function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Texto plano para logs y para insertar en el DOM con textContent.
 *
 * Saca caracteres de control (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) y
 * recorta al largo máximo. El objetivo es el LOG INJECTION: un `\n`
 * dentro de un dato cargado por el ETL permite FALSIFICAR líneas
 * enteras del registro de la consola.
 *
 * @param {unknown} valor
 * @param {number} [max=300]
 * @returns {string}
 */
export function textoSeguro(valor, max = 300) {
  const s = String(valor ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** Claves que NUNCA deben terminar en un console.* ni en unreporte. */
const CLAVES_SENSIBLES = Object.freeze([
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'servicekey',
  'service_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'suscripcion',
])

const esClaveSensible = (k) => CLAVES_SENSIBLES.includes(String(k).toLowerCase().replace(/[_\s-]/g, ''))

/**
 * Copia un objeto dejando los campos sensibles como '***'.
 *
 * `console.error('[data]', error)` con un error de Supabase incluye la
 * configuración de la petición: URL del proyecto y headers. En un
 * teléfono con DevTools remoto eso es una credencial a la vista.
 *
 * Máximo 5 niveles: un objeto cíclico no debe colgar la app justo en
 * el camino del error.
 *
 * @param {unknown} valor
 * @param {number} [nivel=0]
 * @returns {unknown}
 */
export function redactar(valor, nivel = 0) {
  if (valor === null || valor === undefined) return valor
  if (nivel > 5) return '[profundo]'
  if (typeof valor !== 'object') {
    return typeof valor === 'string' && /^eyJ[A-Za-z0-9_-]{10,}\./.test(valor) ? '***JWT***' : valor
  }
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => redactar(v, nivel + 1))

  const out = {}
  for (const [k, v] of Object.entries(valor)) {
    if (esClaveSensible(k)) {
      out[k] = v === null || v === undefined ? v : '***'
      continue
    }
    if (v instanceof Error) {
      out[k] = textoSeguro(v.message, 200)
      continue
    }
    out[k] = redactar(v, nivel + 1)
  }
  return out
}
