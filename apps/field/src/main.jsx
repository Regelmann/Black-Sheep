import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProveedorSesion } from './hooks/useSesion.jsx'
import { initOutbox } from './lib/outboxDb.js'
import App from './App.jsx'
import './estilos/tokens.css'
import './estilos/app.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // En terreno se pierde señal constantemente. Datos de 5 minutos
      // son mejores que una pantalla vacía.
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
      retry: (n, e) => !['42703', '42501', 'PGRST301', '0A000'].includes(e?.code) && n < 2,
    },
  },
})

// La cola se hidrata desde IndexedDB ANTES de pintar: si la app arranca
// sin ella, un pedido de ayer podría no aparecer y el vendedor lo carga
// de nuevo.
initOutbox().finally(() => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <ProveedorSesion>
            <App />
          </ProveedorSesion>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  )
})
