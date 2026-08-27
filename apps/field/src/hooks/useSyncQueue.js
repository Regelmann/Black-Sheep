/**
 * useSyncQueue — estado de la outbox offline.
 *
 * QUÉ SE ARREGLÓ RESPECTO A LA V9.0 ORIGINAL:
 *
 * 1. FLUSH DUPLICADO: cada montaje instalaba su propio listener 'online'
 *    y su propio setInterval. Dos <SyncBanner/> en pantalla = dos flush
 *    simultáneos sobre la MISMA cola → check-ins duplicados en el servidor.
 *    Ahora hay un único store singleton a nivel de módulo; N componentes
 *    se suscriben, pero sólo corre un flush.
 *
 * 2. POLLING PERMANENTE: setInterval(8000) sondeaba localStorage para
 *    siempre. Ahora la cola notifica cuando cambia (enqueue/flush) y sólo
 *    se re-lee ante eventos reales.
 *
 * 3. STRING MÁGICO: 'kf_action_queue_v1' estaba duplicado acá. Ahora se
 *    importa QUEUE_KEY desde offline.js (fuente única).
 *
 * 4. MODO CONTROLADO CON EFECTOS: SyncBanner llamaba al hook aunque le
 *    pasaran props. Ahora `enabled:false` desconecta todo.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loadActionQueue, isProbablyOffline, QUEUE_KEY } from '../lib/offline.js'
import { runSyncFlush, discardSyncQueue } from '../lib/sync/engine.js'

/* ---------------- store singleton ---------------- */

let _items = loadActionQueue()
let _status = 'idle'
let _inFlight = false
const _subs = new Set()

function emit() { _subs.forEach((fn) => fn()) }

function setItems(next) {
  const changed =
    next.length !== _items.length ||
    next.some((it, i) => it?.ts !== _items[i]?.ts || it?.type !== _items[i]?.type)
  if (changed) { _items = next; emit() }
}
function setStatus(s) { if (s !== _status) { _status = s; emit() } }

function refresh() { setItems(loadActionQueue()) }

/** Un solo flush a la vez, sin importar cuántos componentes lo pidan. */
async function flush(handlers) {
  if (_inFlight) return
  if (isProbablyOffline()) { setStatus('offline'); return }
  _inFlight = true
  setStatus('syncing')
  try {
    const res = await runSyncFlush(handlers)
    setItems(loadActionQueue())
    if (res.status === 'success') {
      setStatus('success')
      setTimeout(() => { if (_status === 'success') setStatus('idle') }, 2500)
    } else if (res.status === 'offline') setStatus('offline')
    else if (res.status === 'empty') setStatus('idle')
    else if (res.status === 'partial') setStatus('idle')
    else setStatus('error')
  } finally {
    _inFlight = false
  }
}

/* Listeners globales: se instalan UNA vez, no por componente. */
let _wired = false
let _handlersRef = {}
function wireGlobal() {
  if (_wired || typeof window === 'undefined') return
  _wired = true
  window.addEventListener('online', () => { refresh(); flush(_handlersRef) })
  window.addEventListener('offline', () => setStatus('offline'))
  window.addEventListener('storage', (e) => { if (e.key === QUEUE_KEY) refresh() })
  // Al volver a primer plano: el vendedor guardó el teléfono con cola pendiente.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refresh(); if (_items.length) flush(_handlersRef) }
  })
}

function subscribe(cb) {
  _subs.add(cb)
  return () => _subs.delete(cb)
}
function getSnapshot() { return _items }
function getStatusSnapshot() { return _status }

/* ---------------- hook ---------------- */

/**
 * @param {object} handlers  mismos handlers de dominio que usan Hoy/Visita
 * @param {{ enabled?: boolean }} [opts]
 */
export function useSyncQueue(handlers = {}, opts = {}) {
  const { enabled = true } = opts
  const hRef = useRef(handlers)

  // Asignar en efecto, no en render (seguro en modo concurrente).
  useEffect(() => { hRef.current = handlers; _handlersRef = handlers })

  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const status = useSyncExternalStore(subscribe, getStatusSnapshot, getStatusSnapshot)
  const [, force] = useState(0)

  useEffect(() => {
    if (!enabled) return
    wireGlobal()
    refresh()
  }, [enabled])

  const retry = useCallback(async () => {
    await flush(hRef.current)
    force((n) => n + 1)
  }, [])

  const discard = useCallback(() => {
    discardSyncQueue()
    setItems([])
    setStatus('idle')
  }, [])

  const pendingCount = items.length
  const offline = isProbablyOffline()
  const resolvedStatus =
    offline && pendingCount > 0 ? 'offline'
    : status === 'idle' && pendingCount > 0 ? 'idle'
    : status

  return { pendingCount, status: resolvedStatus, items, retry, discard, refresh }
}

export default useSyncQueue
