import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // El objetivo del roadmap es <250 kB en la carga inicial.
    // 500 es el default de Vite; se baja para que el aviso aparezca antes.
    chunkSizeWarningLimit: 400,

    rollupOptions: {
      output: {
        /**
         * Separación de vendors por FRECUENCIA DE CAMBIO, no por tamaño.
         *
         * React y Supabase cambian una vez cada varios meses; el código
         * de la app cambia cada deploy. Si viajan juntos, cada deploy
         * invalida los 300 kB de librerías que el vendedor ya tenía
         * cacheados y los vuelve a bajar en 4G.
         *
         * Separados: un deploy normal sólo baja el chunk de la app.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Supabase es el más pesado y el que menos cambia.
          if (id.includes('@supabase')) return 'vendor-supabase'

          // React + router: el núcleo, estable entre versiones.
          if (id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('react-router') ||
              id.includes('@remix-run')) return 'vendor-react'

          return 'vendor'
        },

        // Nombres con hash: cache infinito seguro en el CDN.
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },

    // El sourcemap no se sirve al usuario, pero permite depurar los
    // errores de producción que reporta un vendedor.
    sourcemap: true,
  },
})
