import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },
  build: { outDir: 'dist', sourcemap: true },
})
