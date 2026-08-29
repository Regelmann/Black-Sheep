/**
 * push.js — suscripción a Web Push para el catálogo público B2B.
 *
 * POR QUÉ ESTE ENFOQUE
 * El cliente abre el catálogo por link (`/catalogo/:token`) SIN sesión.
 * La suscripción se guarda por RPC SECURITY DEFINER (guardar_push_suscripcion)
 * validando que el token del catálogo exista. La suscripción se identifica
 * por un `id` (UUID) que el cliente guarda en localStorage: conocerlo es la
 * credencial para desuscribirse. El ENVÍO del push lo hace la Edge Function
 * `notificar-catalogo` (con la VAPID private key) — acá sólo se pide permiso
 * y se registra el teléfono/navegador.
 *
 * REQUISITOS: HTTPS (contexto seguro) + service worker activo + clave pública
 * VAPID en `VITE_VAPID_PUBLIC_KEY`. Sin esas tres cosas `pushDisponible()`
 * devuelve false y la UI no muestra el botón.
 */

// La clave pública VAPID. Se comparte con los clientes (no es secreta);
// la PRIVADA vive sólo en la Edge Function.
// Se usa optional chaining: en el runner de tests (Node puro, sin Vite)
// import.meta.env es undefined y `import.meta.env.X` lanzaría TypeError.
const VAPID_PUBLIC = ((import.meta.env?.VITE_VAPID_PUBLIC_KEY) || '').trim()
const SUB_KEY = 'bs_push_sub_id'

/** ¿El navegador puede y vale la pena ofrecer push? (guardas, no supuestos) */
export function pushDisponible() {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false        // Web Push sólo en HTTPS
  if (!('serviceWorker' in navigator)) return false
  if (!('PushManager' in window)) return false
  if (!VAPID_PUBLIC) return false                  // sin clave pública no se puede suscribir
  return true
}

/** Convierte la clave pública base64url a Uint8Array (formato de PushManager). */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Identificador de esta suscripción en este dispositivo. */
function subId() {
  let id = null
  try {
    id = localStorage.getItem(SUB_KEY)
  } catch {
    /* storage bloqueado */
  }
  if (!id) {
    id =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    try {
      localStorage.setItem(SUB_KEY, id)
    } catch {
      /* el push sigue funcionando; sólo no se puede borrar por id */
    }
  }
  return id
}

/**
 * Pide permiso y registra (o reutiliza) la suscripción del navegador.
 * @returns {Promise<{ok:true, subscripcion:object}|{ok:false, error:string}>}
 */
export async function suscribirPush(token) {
  if (!pushDisponible()) {
    return { ok: false, error: 'Este navegador no soporta notificaciones en este dispositivo.' }
  }
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      return { ok: false, error: 'Permiso denegado. Activá las notificaciones en la configuración del navegador.' }
    }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
    }

    const id = subId()
    const { error } = await supabaseRpc(token, id, sub, null)
    if (error) {
      // Si el guardado falló, mejor desuscribir el push local para no
      // quedar con una suscripción que nadie va a poder notificar.
      await sub.unsubscribe().catch(() => {})
      return { ok: false, error: `No se pudo registrar la suscripción: ${error.message || error}` }
    }
    return { ok: true, subscripcion: sub.toJSON() }
  } catch (e) {
    return { ok: false, error: e.message || 'No se pudo suscribir a las notificaciones' }
  }
}

/** Baja la suscripción: permiso y registro en la base. */
export async function desuscribirPush(token) {
  try {
    // Quitar el endpoint del navegador (si existe) sin que el error de esto
    // impida borrar el registro en la base.
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
    }
    const id = subId()
    await supabaseRpc(token, id, null, 'borrar')
    try {
      localStorage.removeItem(SUB_KEY)
    } catch {
      /* ignorado */
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || 'No se pudo desuscribir' }
  }
}

/**
 * Invoca el RPC correspondiente, evitando el import circular con supabase
 * (se importa lazy). Guardar = guardar_push_suscripcion; borrar =
 * borrar_push_suscripcion.
 */
async function supabaseRpc(token, id, suscripcion, modo) {
  // Import dinámico: evita cargar supabase en módulos que sólo checkean
  // pushDisponible() (como los tests que leen este archivo).
  const { supabase } = await import('./supabase.js')
  if (modo === 'borrar') {
    return supabase.rpc('borrar_push_suscripcion', { p_id: id })
  }
  return supabase.rpc('guardar_push_suscripcion', {
    p_token: token,
    p_id: id,
    p_suscripcion: suscripcion ? suscripcion.toJSON ? suscripcion.toJSON() : suscripcion : null,
    p_dispositivo:
      typeof navigator !== 'undefined'
        ? (navigator.userAgent || '').slice(0, 200) || null
        : null,
  })
}
