import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel expone el commit y la rama en el entorno de build. Se
// convierten en variables de Vite para que la app pueda mostrarlas.
process.env.VITE_COMMIT = process.env.VERCEL_GIT_COMMIT_SHA || 'local'
process.env.VITE_RAMA   = process.env.VERCEL_GIT_COMMIT_REF || 'local'
process.env.VITE_FECHA  = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  plugins: [react()],
  build: {
    // Lo abre un cliente en la calle, con el dato que le quede del mes.
    // Sin TanStack Query ni router: una sola pantalla no los necesita y
    // cada kilobyte acá es un segundo antes de ver el primer producto.
    chunkSizeWarningLimit: 260,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react'
          if (id.includes('node_modules/@supabase')) return 'supabase'
        },
      },
    },
  },
})
