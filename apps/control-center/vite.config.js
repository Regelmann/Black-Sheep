import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel expone el commit y la rama en el entorno de build. Se
// convierten en variables de Vite para que la app pueda mostrarlas.
process.env.VITE_COMMIT = process.env.VERCEL_GIT_COMMIT_SHA || 'local'
process.env.VITE_RAMA   = process.env.VERCEL_GIT_COMMIT_REF || 'local'
process.env.VITE_FECHA  = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },
  build: { outDir: 'dist', sourcemap: true },
})
