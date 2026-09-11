import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProveedorSesion } from './hooks/useSesion.jsx'
import App from './App.jsx'
import '../../../packages/marca/tokens.css'
import '../../../packages/marca/base.css'
import './estilos/app.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (intentos, error) => {
        // Una columna que no existe (42703) o un permiso denegado (42501)
        // no aparecen por reintentar. Sólo se reintenta la red.
        if (['42703', '42501', 'PGRST301', '0A000'].includes(error?.code)) return false
        return intentos < 2
      },
    },
  },
})

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
