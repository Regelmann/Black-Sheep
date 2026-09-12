import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProveedorSesion } from './hooks/useSesion.jsx'
import App from './App.jsx'
import '../../../packages/marca/tokens.css'
import '../../../packages/marca/base.css'
import '../../../packages/ui/ui.css'
import '../../../packages/marca/admin.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !['42501', '42703', 'PGRST301'].includes(e?.code) && n < 2,
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
