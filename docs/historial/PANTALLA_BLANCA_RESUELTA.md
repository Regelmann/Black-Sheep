# v-BS-PLATFORM-V10.4.1 — La pantalla en blanco

**223/223 · ESLint 0 · typecheck ✅ · guard ✅ · build ✓**

## La causa, con nombre y apellido

```
vendor-y6tIumIi.js:9  Uncaught TypeError:
Cannot read properties of undefined (reading 'createContext')
```

**Fue un bug mío, introducido en V9.9.6 con el code-splitting.**

Escribí este `manualChunks`:

```js
if (id.includes('@supabase'))  return 'vendor-supabase'
if (id.includes('/react/') || …) return 'vendor-react'
return 'vendor'                              // ← todo lo demás
```

`@tanstack/react-query` cayó en `vendor` y **llama a `React.createContext` a
nivel de módulo**. Cuando el navegador evalúa `vendor` antes que
`vendor-react`, React todavía no existe:

```
React is undefined → React.createContext → TypeError → nada monta
```

Nada más se ejecuta. Pantalla en blanco.

## Lo peor: Vite lo avisaba

En **cada build** desde V10.3:

```
Circular chunk: vendor -> vendor-react -> vendor.
Please adjust the manual chunk logic for these chunks.
```

Era un *warning*. No frenaba el build, no frenaba el CI, y pasaba entre 20
líneas de salida. Una advertencia que nadie mira es una advertencia que no
existe.

## El arreglo

**Regla:** cualquier paquete que dependa de React va **en el mismo chunk que
React**. Separar una librería de su runtime es pedir un problema de orden de
evaluación.

Verificado tras el cambio:

```
sin "Circular chunk"
createContext sólo aparece en vendor-react
vendor genérico: 10 kB → 6 kB   (TanStack se movió al chunk correcto)
```

| Chunk | |
|---|---|
| index (app) | 246 kB |
| vendor-supabase | 209 kB |
| vendor-react | 186 kB · incluye TanStack |
| vendor | 6 kB |

## Que no vuelva a pasar

**CI:** `npm run build` ahora se lee, y si aparece `Circular chunk` **falla el
build**. Un warning que precede a una pantalla en blanco no puede ser un
warning.

**Guard R17:** compara las dependencias de `package.json` contra el
`manualChunks`. Si un paquete con "react" en el nombre no está agrupado con
`vendor-react`, bloquea.

## Sobre las otras dos correcciones de V10.4

Siguen siendo válidas y necesarias, aunque no fueran *esta* causa:

- **El Service Worker cacheando `index.html`** produce exactamente el mismo
  síntoma tras un deploy. Es una segunda vía a la misma pantalla blanca.
- **La guardia de arranque de `index.html`** es lo que hace que, la próxima
  vez, veas el error escrito en la pantalla en vez de nada.

## Al desplegar

1. Cerrá la PWA por completo en el teléfono y volvé a abrir.
2. Si aún ves blanco: esperá 8 segundos y tocá **"Limpiar caché y recargar"**.
   Eso borra el Service Worker viejo, que sigue activo hasta ser reemplazado.
