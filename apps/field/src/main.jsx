import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { crearQueryClient } from './lib/queryClient.js'
import { ErrorBoundary } from './chrome/ErrorBoundary.jsx'
import { BUILD_STAMP } from './lib/buildStamp.js'

let queryClient
try { queryClient = crearQueryClient() } catch (e) { console.error('[boot] crearQueryClient falló; se usa uno por defecto', e); queryClient = new QueryClient() }
import './index.css'
import './styles/identidad.css'
import './styles/v90-fixes.css'
import './styles/ds-2026.css'
import './styles/system.css'
import './styles/v99-ux.css'
import './styles/shell.css'
import './styles/arreglos-ux.css'
import './styles/ai-native-ux.css'

import { initOutbox } from './lib/outboxDb.js'
initOutbox().then(r => console.info(`[outbox] ${r.durable ? 'IndexedDB' : 'localStorage (degradado)'} · ${r.items} pendiente(s)${r.migrados ? ` · ${r.migrados} migrado(s)` : ''}`)).catch(e => console.error('[outbox] no se pudo inicializar', e))

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary stamp={BUILD_STAMP} zona="raiz">
        <BrowserRouter><QueryClientProvider client={queryClient}><App /></QueryClientProvider></BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
} catch (e) {
  console.error('[boot] no se pudo montar la app', e)
  const r = document.getElementById('root')
  if (r) r.innerHTML = '<div style="font-family:system-ui;padding:32px 20px;text-align:center"><h1 style="font-size:19px;margin:24px 0 8px">La app no pudo abrir</h1><p style="color:#78716c;font-size:13.5px;margin:0 0 18px">Tus datos guardados están a salvo.</p><button onclick="location.reload()" style="min-height:50px;padding:0 26px;border:0;border-radius:12px;background:#c2410c;color:#fff;font-weight:800;font-size:15px">Recargar</button></div>'
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {})
}
