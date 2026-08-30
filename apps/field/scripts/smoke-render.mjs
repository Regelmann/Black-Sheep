#!/usr/bin/env node
/**
 * smoke-render — monta las páginas de verdad y falla si alguna revienta.
 *
 * POR QUÉ EXISTE
 * El proyecto tiene 141 tests, ESLint sin errores y chequeo de tipos, y aun
 * así se coló un `ReferenceError: Cannot access 'ejecutivos' before
 * initialization` al migrar Admin a TanStack Query: un `useMemo` quedó
 * leyendo una variable declarada más abajo. Resultado en producción:
 * **pantalla en blanco en la pestaña Clientes**.
 *
 * Ninguna de las tres herramientas podía verlo:
 *   · ESLint no marca temporal dead zone entre hooks de un mismo componente.
 *   · tsc no cubre .jsx todavía.
 *   · los tests unitarios prueban lib/, nunca montan un componente.
 *
 * La única forma de atrapar esa clase de fallo es renderizar. Esto compila
 * cada página con Vite en modo SSR y la monta con renderToString sobre un
 * supabase falso. No valida la UI: valida que la pantalla EXISTA.
 *
 * Uso:  node scripts/smoke-render.mjs
 */
import { build } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const SALIDA = path.join(RAIZ, '.smoke')

/**
 * Todas las páginas de la app. Cada una debe poder montarse con datos
 * mínimos: si revienta acá, en producción es una pantalla en blanco.
 */
const PAGINAS = [
  { nombre: 'Admin', archivo: 'src/pages/Admin.jsx' },
  { nombre: 'Cartera', archivo: 'src/pages/Cartera.jsx' },
  { nombre: 'CatalogoCliente', archivo: 'src/pages/CatalogoCliente.jsx' },
  { nombre: 'Gerencia', archivo: 'src/pages/Gerencia.jsx' },
  { nombre: 'Hoy', archivo: 'src/pages/Hoy.jsx' },
  { nombre: 'Login', archivo: 'src/pages/Login.jsx' },
  { nombre: 'Ruta', archivo: 'src/pages/Ruta.jsx' },
  { nombre: 'Stock', archivo: 'src/pages/Stock.jsx' },
  { nombre: 'Visita', archivo: 'src/pages/Visita.jsx' },
]

/** Lo mínimo que App.jsx garantiza tener antes de montar una página. */
const SESION_FALSA = { user: { id: '00000000-0000-0000-0000-000000000001', email: 'qa@blacksheep.cl' } }

/** Builder falso: cualquier método encadenado devuelve lo mismo y resuelve a filas. */
function builderFalso(rows) {
  const p = Promise.resolve({ data: rows, error: null })
  const manejador = {
    get(_t, k) {
      if (k === 'then') return p.then.bind(p)
      if (k === 'catch') return p.catch.bind(p)
      if (k === 'finally') return p.finally.bind(p)
      return () => new Proxy(p, manejador)
    },
  }
  return new Proxy(p, manejador)
}

async function main() {
  const { registerSupabaseForTests } = await import('../src/lib/supabase.js')
  const { crearQueryClient } = await import('../src/lib/queryClient.js')

  registerSupabaseForTests({
    from: () => builderFalso([{ id: 1, cliente_key: 'C1', nombre_cliente: 'Cliente de prueba' }]),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  })

  let fallas = 0

  for (const p of PAGINAS) {
    try {
      await build({
        root: RAIZ,
        logLevel: 'error',
        build: {
          ssr: true,
          outDir: SALIDA,
          emptyOutDir: true,
          minify: false,
          rollupOptions: {
            input: path.join(RAIZ, p.archivo),
            output: { entryFileNames: 'pagina.mjs' },
          },
        },
      })

      const mod = await import(path.join(SALIDA, 'pagina.mjs') + '?t=' + Date.now())
      const Componente = mod.default || mod[p.nombre]
      if (typeof Componente !== 'function') throw new Error('no exporta un componente')

      // MemoryRouter: seis páginas usan useParams/useNavigate y sin un router
      // en el árbol lanzan antes de renderizar nada.
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: crearQueryClient() },
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/'] },
            // Sesión falsa: App.jsx nunca renderiza estas páginas sin sesión
            // (corta antes con la pantalla de login), así que montarlas sin
            // ella probaría un escenario que no existe en producción.
            React.createElement(Componente, { session: SESION_FALSA })
          )
        )
      )

      if (html === null || html === undefined) throw new Error('renderizó vacío (pantalla en blanco)')
      console.log(`   ✓ ${p.nombre} monta (${html.length} bytes)`)
    } catch (e) {
      fallas++
      console.error(`   ✗ ${p.nombre}: ${e?.message || e}`)
    }
  }

  fs.rmSync(SALIDA, { recursive: true, force: true })

  if (fallas) {
    console.error(`\n❌ ${fallas} página(s) no montan. Eso es una pantalla en blanco.\n`)
    process.exit(1)
  }
  console.log('\n✅ Todas las páginas montan\n')
  process.exit(0)
}

console.log('─'.repeat(60))
console.log('SMOKE RENDER · las páginas deben montar')
console.log('─'.repeat(60))
main()