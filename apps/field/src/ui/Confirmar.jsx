/**
 * Confirmar — reemplazo de window.confirm().
 *
 * El diálogo nativo lo dibuja el navegador: caja gris, el dominio arriba
 * y un botón "Aceptar" en el idioma del sistema operativo. No se puede
 * diseñar y rompe la ilusión de app al instante. Además bloquea el hilo
 * de JavaScript mientras está abierto.
 *
 * Este sheet sube desde abajo, donde está el pulgar, y sigue la misma
 * jerarquía que el resto de la app: la acción destructiva a la derecha,
 * en rojo, y la salida segura a la izquierda.
 *
 * El botón de confirmar dice QUÉ va a pasar ("Eliminar foco"), no "Sí".
 * En una lista de focos parecidos, "¿Estás seguro? / Sí" no dice nada
 * sobre qué se está por borrar.
 */
import { useEffect } from 'react'

export default function Confirmar({
  titulo,
  detalle,
  confirmar = 'Eliminar',
  cancelar = 'Cancelar',
  destructivo = true,
  onConfirmar,
  onCancelar,
}) {
  /* El confirm() nativo se cerraba con Escape. Sin esto, el reemplazo
     sería un retroceso: un modal del que no se puede salir con teclado.
     Mismo patrón que ZonePicker. */
  useEffect(() => {
    if (!onCancelar) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancelar])

  return (
    <div
      className="bs-confirm-backdrop"
      role="presentation"
      onClick={onCancelar}
    >
      <div
        className="bs-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bs-confirm-handle" />
        <p className="bs-confirm-title">{titulo}</p>
        {detalle && <p className="bs-confirm-detail">{detalle}</p>}
        <div className="bs-confirm-actions">
          <button type="button" className="bs-confirm-cancel" onClick={onCancelar}>
            {cancelar}
          </button>
          <button
            type="button"
            className={'bs-confirm-ok' + (destructivo ? ' is-destructive' : '')}
            onClick={onConfirmar}
          >
            {confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}