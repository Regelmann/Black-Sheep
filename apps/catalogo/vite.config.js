import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
