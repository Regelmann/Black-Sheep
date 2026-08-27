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
        /**
         * SEPARACIÓN DE VENDORS — con una regla que se aprendió a la mala.
         *
         * 🔴 EL BUG QUE ESTO ARREGLA
         * La versión anterior mandaba React a `vendor-react` y TODO lo demás
         * a `vendor`. Pero @tanstack/react-query LLAMA a React.createContext
         * a nivel de módulo. Si `vendor` se evalúa antes que `vendor-react`,
         * React todavía no existe:
         *
         *   Uncaught TypeError: Cannot read properties of undefined
         *   (reading 'createContext')      ← PANTALLA EN BLANCO
         *
         * Vite lo avisaba en cada build:
         *   "Circular chunk: vendor -> vendor-react -> vendor"
         * y nadie lo miraba, porque era un warning y no un error.
         *
         * REGLA: cualquier paquete que dependa de React va EN EL MISMO chunk
         * que React. Separar una librería de su runtime es pedir un problema
         * de orden de evaluación.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Supabase no toca React: puede ir solo, y es el más pesado.
          if (id.includes('@supabase')) return 'vendor-supabase'

          // React y TODO lo que lo usa, juntos. El orden deja de importar.
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('react-router') ||
            id.includes('@remix-run') ||
            id.includes('@tanstack') ||
            /node_modules\/[^/]*react[^/]*\//.test(id)
          ) return 'vendor-react'

          return 'vendor'
        },

        // Nombres con hash: cache infinito seguro en el CDN.
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },

    // El sourcemap no se sirve al usuario, pero permite depurar los
    // errores de producción que reporta un vendedor.
    // 'hidden': genera los .map para depurar, pero NO agrega el comentario
    // //# sourceMappingURL al bundle. Sin ese comentario el navegador no
    // los pide: dejan de servirse al público.
    //
    // Con sourcemap:true cualquiera podía leer la lógica de precios,
    // márgenes y scoring desde DevTools. Son ~2,6 MB de código fuente.
    sourcemap: 'hidden',
  },
})
