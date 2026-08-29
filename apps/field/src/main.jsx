import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { crearQueryClient } from './lib/queryClient.js'
import { ErrorBoundary } from './chrome/ErrorBoundary.jsx'
import { BUILD_STAMP } from './lib/buildStamp.js'

// Cliente único para toda la app. Reemplaza los useEffect+useState a mano:
// da caché, dedupe, revalidación al volver al foco y cancelación.
// La política de reintento envuelve safeSelect, así que explainError sigue
// funcionando: un 42703 (columna inexistente) NO se reintenta, un fallo de
// red sí.
// Si crearQueryClient() falla, la app entera no monta y el vendedor ve
// pantalla en blanco. Un cliente de caché roto NO puede impedir trabajar.
let queryClient
try {
  queryClient = crearQueryClient()
} catch (e) {
  console.error('[boot] crearQueryClient falló; se usa uno por defecto', e)
  queryClient = new QueryClient()
}
import './index.css'
// identidad: define variables, no pelea selectores. Va después de los
// tokens base y antes de las capas de componentes.
import './styles/identidad.css'
import './styles/v90-fixes.css'
import './styles/ds-2026.css'
import './styles/system.css'
// V9.9 carga ÚLTIMA: es la capa que resuelve conflictos entre las anteriores.
import './styles/v99-ux.css'
// El shell carga ÚLTIMO: es la estructura que gana sobre las capas viejas.
import './styles/shell.css'
import './styles/arreglos-ux.css'
// El catálogo público carga ÚLTIMO: es la pantalla que ve el cliente
// y no puede quedar a merced de la cascada heredada.
import './styles/catalogo.css'

// Hidratar la cola ANTES de montar React: si un vendedor cerró la app con
// acciones pendientes, tienen que estar disponibles desde el primer render.
// La migración de localStorage → IndexedDB ocurre acá, una sola vez.
import { initOutbox } from './lib/outboxDb.js'
initOutbox()
  .then(r => {
    console.info(
      `[outbox] ${r.durable ? 'IndexedDB' : 'localStorage (degradado)'} · ` +
      `${r.items} pendiente(s)${r.migrados ? ` · ${r.migrados} migrado(s)` : ''}`
    )
  })
  .catch(e => console.error('[outbox] no se pudo inicializar', e))

// El montaje va en try/catch: si algo revienta acá, se escribe el error
// en #root en vez de dejar la pantalla vacía. La guardia de index.html
// cubre el caso en que el bundle ni siquiera llegue a ejecutarse.
try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {/* El boundary va POR FUERA de los providers: si QueryClientProvider
          o BrowserRouter fallan al montar, adentro no hay nadie que lo
          atrape y vuelve la pantalla en blanco. */}
      <ErrorBoundary stamp={BUILD_STAMP} zona="raiz">
        <BrowserRouter>
          <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
} catch (e) {
  console.error('[boot] no se pudo montar la app', e)
  const r = document.getElementById('root')
  if (r) {
    r.innerHTML =
      '<div style="font-family:system-ui;padding:32px 20px;text-align:center">' +
      '<h1 style="font-size:19px;margin:24px 0 8px">La app no pudo abrir</h1>' +
      '<p style="color:#78716c;font-size:13.5px;margin:0 0 18px">Tus datos guardados están a salvo.</p>' +
      '<button onclick="location.reload()" style="min-height:50px;padding:0 26px;border:0;border-radius:12px;background:#c2410c;color:#fff;font-weight:800;font-size:15px">Recargar</button>' +
      '</div>'
  }
}

/**
 * SERVICE WORKER
 *
 * Causa probable de la pantalla en blanco: un SW viejo cacheando el
 * index.html. El HTML cacheado apunta a chunks con hash que ya no
 * existen en el servidor → los imports fallan → nada monta.
 *
 * Dos cambios:
 *  · Sólo en PROD. En desarrollo un SW cachea el bundle de dev y deja
 *    de reflejar los cambios; peor, sobrevive al `npm run dev`.
 *  · En dev se DESREGISTRAN los que hayan quedado de un build anterior.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(rs => rs.forEach(r => r.unregister()))
    .catch(() => {})
}
