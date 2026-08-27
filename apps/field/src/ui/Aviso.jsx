/**
 * Aviso — reemplazo de window.alert().
 *
 * Un alert() interrumpe, exige un clic y no se puede leer mientras se
 * sigue trabajando. Casi siempre lo que hay que decir es "esto no se
 * pudo hacer" o "listo": un mensaje que aparece arriba, se lee de reojo
 * y se va solo.
 *
 * Los errores NO se van solos: si el bloqueo de un cliente falló, el
 * vendedor tiene que enterarse aunque haya mirado para otro lado. Se
 * cierran tocándolos.
 */
import { useEffect, useRef } from 'react'

export default function Aviso({ tipo = 'info', texto, onCerrar, duracion = 3500 }) {
  const esError = tipo === 'error'

  /* Quien nos usa escribe `onCerrar={() => setAviso(null)}`: una función
     distinta en cada render. Si el efecto dependiera de ella, la cuenta
     se rearmaría en cada tecla del buscador y el aviso no se cerraría
     nunca. Se guarda la última versión en una ref y el efecto depende
     sólo de lo que debe reiniciar el reloj: el mensaje y su tipo. */
  const cerrarRef = useRef(onCerrar)
  useEffect(() => {
    cerrarRef.current = onCerrar
  }, [onCerrar])

  useEffect(() => {
    // Un error se queda hasta que lo lean; un éxito se va solo.
    if (esError || !texto) return undefined
    const t = setTimeout(() => cerrarRef.current?.(), duracion)
    return () => clearTimeout(t)
  }, [esError, texto, duracion])

  if (!texto) return null

  return (
    <div
      className={'bs-aviso is-' + tipo}
      role={esError ? 'alert' : 'status'}
      onClick={onCerrar}
    >
      <span className="bs-aviso-txt">{texto}</span>
      {esError && (
        <span className="bs-aviso-cerrar" aria-hidden="true">
          ✕
        </span>
      )}
    </div>
  )
}