/**
 * Deja que un término de búsqueda "se asiente" antes de usarlo.
 *
 * POR QUÉ ES DISTINTO DE `setTimeout(load, 280)`
 * El patrón anterior demoraba la LLAMADA, pero no coordinaba las respuestas:
 * si el usuario escribía rápido, salían varias consultas y ganaba la que
 * volvía última, no la más reciente. Escribir "chacra" podía terminar
 * mostrando los resultados de "chac" si esa respuesta se demoraba más —
 * carrera clásica, y frecuente en terreno donde la latencia es errática.
 *
 * Acá el valor debounced se usa como parte de la queryKey. TanStack cachea
 * por key e ignora las respuestas de keys que ya no están activas, así que el
 * problema desaparece por construcción en vez de por cancelación manual.
 */
import { useEffect, useState } from 'react'

/**
 * @param {string} valor
 * @param {number} [ms]
 * @returns {string} el valor recortado, tras `ms` sin cambios
 */
export function useTerminoDebounced(valor, ms = 280) {
  const [asentado, setAsentado] = useState(() => String(valor ?? '').trim())

  useEffect(() => {
    const limpio = String(valor ?? '').trim()
    const t = setTimeout(() => setAsentado(limpio), ms)
    return () => clearTimeout(t)
  }, [valor, ms])

  return asentado
}