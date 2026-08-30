/**
 * Resolución del perfil del ejecutivo a partir de la fila de `ejecutivos`.
 *
 * EL BUG QUE LO MOTIVÓ
 * App.jsx hacía `.then(({ data }) => ...)` descartando `error`. Como
 * supabase-js NO lanza (devuelve `{ data: null, error }`), un SELECT que
 * fallaba por red o por RLS entregaba `data = null`, y el código
 * interpretaba eso como "usuario autenticado sin fila en ejecutivos":
 * construía un perfil por defecto con `esSuperAdmin: false`.
 *
 * Resultado: un GERENTE con un problema de red entraba degradado a
 * vendedor común — sin /gerencia ni /admin — y sin ningún aviso. Los
 * botones simplemente no estaban. Es el peor tipo de fallo de permisos:
 * silencioso e indistinguible de "no tenés acceso".
 *
 * "No hay fila" y "no pude leer la fila" son cosas distintas.
 */

/**
 * @typedef {{id:string, nombre:string, zona:string, rol:string, esSuperAdmin:boolean, degradado?:boolean}} Perfil
 */

const ROLES_ELEVADOS = new Set(['superadmin', 'gerente', 'admin'])

/**
 * @param {any} fila fila de `ejecutivos` (o null)
 * @param {{id:string, email?:string}} usuario usuario de auth
 * @returns {Perfil}
 */
export function perfilDesdeFila(fila, usuario) {
  if (!fila) {
    return {
      id: usuario?.id || '',
      nombre: usuario?.email || '',
      zona: '',
      rol: 'ejecutivo',
      esSuperAdmin: false,
    }
  }
  const rol = String(fila.rol || 'ejecutivo').toLowerCase()
  return {
    id: fila.id,
    nombre: fila.nombre || '',
    zona: fila.zona || '',
    rol,
    esSuperAdmin: ROLES_ELEVADOS.has(rol),
  }
}

/**
 * Decide qué hacer con la respuesta completa del SELECT.
 *
 * @param {{data:any, error:any}} respuesta
 * @param {{id:string, email?:string}} usuario
 * @returns {{perfil:Perfil|null, error:string|null}}
 *   `perfil: null` significa "no se pudo determinar": la app debe
 *   reintentar o avisar, NUNCA asumir el perfil mínimo.
 */
export function resolverPerfil(respuesta, usuario) {
  const { data, error } = respuesta || {}
  if (error) {
    /* No se degrada al usuario por un fallo de lectura: si es gerente,
       tiene que seguir siéndolo cuando vuelva la red. */
    return {
      perfil: null,
      error: error.message || 'No se pudo leer tu perfil',
    }
  }
  return { perfil: perfilDesdeFila(data, usuario), error: null }
}