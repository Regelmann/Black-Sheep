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
    // El vendedor abre esto en 3G en la calle. 250 kB es el techo.
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        // Separación por FRECUENCIA DE CAMBIO, no por tamaño: React y
        // Supabase cambian cada varios meses, la app cada deploy. Si
        // viajan juntos, cada deploy hace rebajar las librerías que el
        // teléfono ya tenía en caché.
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/@tanstack')) return 'query'
        },
      },
    },
  },
})
