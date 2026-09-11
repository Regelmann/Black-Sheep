/**
 * Sello de compilación · fuente única.
 *
 * POR QUÉ EXISTE
 * Tres veces seguidas discutimos si un cambio estaba desplegado o no,
 * mirando capturas. Sin un sello visible, "no se ve el cambio" y "el
 * cambio no se subió" son indistinguibles, y se pierde media hora cada
 * vez.
 *
 * Vercel expone el commit en tiempo de build. Vite lo inyecta y la app
 * lo muestra. Con eso, comparar lo desplegado contra GitHub es leer una
 * línea.
 */
export const VERSION = {
  commit: (import.meta.env.VITE_COMMIT || 'local').slice(0, 7),
  rama: import.meta.env.VITE_RAMA || 'local',
  fecha: import.meta.env.VITE_FECHA || '',
}

export const selloCorto = () =>
  VERSION.commit === 'local' ? 'local' : `${VERSION.commit}`
