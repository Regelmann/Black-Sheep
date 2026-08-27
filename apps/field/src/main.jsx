import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { crearQueryClient } from './lib/queryClient.js'

// Cliente único para toda la app. Reemplaza los useEffect+useState a mano:
// da caché, dedupe, revalidación al volver al foco y cancelación.
// La política de reintento envuelve safeSelect, así que explainError sigue
// funcionando: un 42703 (columna inexistente) NO se reintenta, un fallo de
// red sí.
const queryClient = crearQueryClient()
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
