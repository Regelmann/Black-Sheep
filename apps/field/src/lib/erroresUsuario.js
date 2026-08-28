/**
 * ERRORES QUE EL VENDEDOR PUEDE ENTENDER
 *
 * En una captura de producción, al intentar guardar un pedido de
 * $577.600 sin señal, la app mostró:
 *
 *     TypeError: Failed to fetch
 *
 * Eso no le dice nada a alguien parado en la puerta de un local. Peor:
 * parece que el pedido se perdió, cuando en realidad quedó en la cola
 * offline y se va a enviar solo. El vendedor lo va a cargar de nuevo,
 * o va a perder la venta por desconfianza.
 *
 * La regla es la misma que en geoErrorMessage: decir QUÉ pasó y QUÉ
 * hacer, en el idioma del vendedor. Nunca el mensaje crudo.
 */

/** ¿Esto es un problema de red y no un error de la app? */
export function esFalloDeRed(error) {
  if (!error) return false
  const texto = `${error.message || error.msg || error}`.toLowerCase()
  return (
    /failed to fetch|networkerror|network request failed|load failed/.test(texto) ||
    /fetch|conexi[oó]n|timeout|timed out|econnrefused|enotfound|offline/.test(texto)
  )
}

/**
 * Mensaje para mostrar en pantalla.
 *
 * @param error       lo que devolvió supabase / fetch
 * @param opts.encolado  true si la acción quedó guardada en la cola
 *                       offline. Cambia por completo el mensaje: no es
 *                       lo mismo "no se pudo" que "se envía después".
 */
export function mensajeDeError(error, { encolado = false } = {}) {
  if (!error) return ''

  if (esFalloDeRed(error)) {
    return encolado
      ? 'Sin señal · guardado en el teléfono, se envía solo cuando vuelva la conexión'
      : 'Sin señal · revisá la conexión y volvé a intentar'
  }

  const texto = `${error.message || error.msg || error}`

  // Errores de Postgres/PostgREST: el código importa, el detalle no.
  if (/duplicate key|23505/i.test(texto)) {
    return 'Esto ya estaba guardado'
  }
  if (/permission denied|row-level security|42501|not authorized|jwt/i.test(texto)) {
    return 'No tenés permiso para esto · avisá al administrador'
  }
  if (/violates foreign key|23503/i.test(texto)) {
    return 'Faltan datos del cliente · abrí la ficha y completala'
  }
  if (/column .* does not exist|42703|relation .* does not exist|42P01/i.test(texto)) {
    return 'La app necesita actualizarse · avisá al administrador'
  }
  if (/timeout|57014/i.test(texto)) {
    return 'Tardó demasiado · volvé a intentar'
  }

  // Un mensaje que ya está en castellano y es corto probablemente lo
  // escribimos nosotros para que se lea: dejarlo pasar.
  if (texto.length <= 90 && !/[A-Za-z]+Error|undefined|null|\bobject\b/i.test(texto)) {
    return texto
  }

  return 'No se pudo guardar · volvé a intentar'
}