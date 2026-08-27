/**
 * Telemetría de errores — dejar de operar a ciegas.
 *
 * EL PROBLEMA
 * Hasta ahora un crash en terreno se descubría cuando un vendedor llamaba por
 * teléfono. El bug de handleCompletar (V10.0) rompía todo cierre de visita
 * offline y pudo vivir meses sin que nadie lo supiera.
 *
 * POR QUÉ NO EL SDK DE SENTRY
 * @sentry/browser pesa 465 kB (154 kB gzip): casi el doble que TODA la app
 * (246 kB). En una PWA que se usa en 4G de terreno, pagar eso por telemetría
 * es una mala transacción — el propio RENDIMIENTO.md fija el objetivo en
 * menos de 2 s de carga.
 *
 * Este módulo habla el protocolo de ingesta de Sentry (endpoint /store/)
 * directamente con fetch. Son ~120 líneas y 0 kB de dependencias, y cubre lo
 * que necesita este producto: excepción, stack, release, usuario y rastro.
 * Si algún día hacen falta perfiles o session replay, se cambia por el SDK.
 *
 * GARANTÍAS
 *  · Sin VITE_SENTRY_DSN no hace absolutamente nada.
 *  · Ningún fallo de telemetría puede romper la app (todo en try/catch).
 *  · No se envían datos comerciales (precios, márgenes, RUT, coordenadas):
 *    la cartera es información sensible y en Chile aplica la Ley 19.628.
 */
import { BUILD_STAMP } from './buildStamp.js'

const DSN = (import.meta.env?.VITE_SENTRY_DSN || '').trim()

let endpoint = null
let usuario = null
let activo = false
const rastros = []
const MAX_RASTROS = 20

/** Campos que NUNCA salen del teléfono. */
const CAMPOS_PROHIBIDOS = /precio|margen|costo|rut|telefono|email|direccion|\blat\b|\blng\b/i

function limpiar(obj) {
  if (!obj || typeof obj !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = CAMPOS_PROHIBIDOS.test(k) ? '[oculto]' : v
  }
  return out
}

/**
 * Traduce el DSN al endpoint de ingesta.
 * DSN: https://<clave>@<host>/<proyecto>
 */
function parseDsn(dsn) {
  try {
    const u = new URL(dsn)
    const proyecto = u.pathname.replace(/^\//, '')
    if (!u.username || !proyecto) return null
    return `${u.protocol}//${u.host}/api/${proyecto}/store/?sentry_key=${u.username}&sentry_version=7`
  } catch {
    return null
  }
}

/** Arranca la telemetría si hay DSN. Idempotente. */
export function initTelemetry() {
  if (activo) return true
  if (!DSN) {
    console.info('[telemetry] sin VITE_SENTRY_DSN — los errores quedan en consola')
    return false
  }
  endpoint = parseDsn(DSN)
  if (!endpoint) {
    console.warn('[telemetry] VITE_SENTRY_DSN mal formado — se ignora')
    return false
  }
  activo = true

  // Errores que ningún ErrorBoundary puede ver: handlers, async, timeouts.
  if (typeof window !== 'undefined') {
    window.addEventListener('error', e => {
      reportarError(e.error || new Error(e.message), { origen: 'window.onerror' })
    })
    window.addEventListener('unhandledrejection', e => {
      reportarError(e.reason || new Error('promesa rechazada'), { origen: 'unhandledrejection' })
    })
    // El ErrorBoundary busca window.Sentry sin importar este módulo.
    window.Sentry = { captureException: (err, ctx) => reportarError(err, ctx?.extra || {}) }
  }

  console.info('[telemetry] activa ·', BUILD_STAMP)
  return true
}

/** Identifica al ejecutivo: sólo id y zona, nada de nombre ni email. */
export function setUsuario(ejecutivo) {
  usuario = ejecutivo ? { id: ejecutivo.id, segment: ejecutivo.zona || 'sin-zona' } : null
}

/**
 * Rastro de navegación. Se adjunta al próximo error y es lo que permite
 * reconstruir qué hizo el vendedor antes del crash.
 */
export function rastro(mensaje, datos = {}) {
  try {
    rastros.push({
      timestamp: Date.now() / 1000,
      message: String(mensaje).slice(0, 200),
      level: 'info',
      data: limpiar(datos),
    })
    if (rastros.length > MAX_RASTROS) rastros.shift()
  } catch {
    /* la telemetría nunca puede romper el flujo de trabajo */
  }
}

/** Reporta un error manejado. Los de render los envía el ErrorBoundary. */
export function reportarError(error, contexto = {}) {
  if (!activo || !endpoint) {
    console.error('[error]', error, contexto)
    return
  }
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const cuerpo = {
      event_id: (crypto?.randomUUID?.() || String(Date.now())).replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: 'error',
      release: BUILD_STAMP,
      environment: import.meta.env?.MODE || 'production',
      logger: 'field',
      user: usuario || undefined,
      tags: limpiar({ build: BUILD_STAMP, ...(contexto.tags || {}) }),
      extra: limpiar(contexto),
      breadcrumbs: { values: rastros.slice(-MAX_RASTROS) },
      request: typeof location !== 'undefined' ? { url: location.href } : undefined,
      exception: {
        values: [{
          type: err.name || 'Error',
          value: String(err.message || err).slice(0, 1000),
          stacktrace: { frames: framesDesde(err) },
        }],
      },
    }

    // keepalive: el envío sobrevive aunque el usuario cierre la pestaña
    // inmediatamente después del crash.
    fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      mode: 'cors',
    }).catch(() => {
      /* sin red: el error se pierde, pero el vendedor puede seguir trabajando */
    })
  } catch {
    /* jamás propagar un fallo de telemetría */
  }
}

/** Convierte el stack en frames con el formato que espera Sentry. */
function framesDesde(err) {
  try {
    return String(err.stack || '')
      .split('\n')
      .slice(1, 25)
      .map(l => l.trim())
      .filter(Boolean)
      .map(linea => {
        const m = linea.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/)
        return m
          ? { function: m[1] || '?', filename: m[2], lineno: +m[3], colno: +m[4] }
          : { function: linea.slice(0, 120) }
      })
      .reverse() // Sentry espera el frame más reciente al final
  } catch {
    return []
  }
}