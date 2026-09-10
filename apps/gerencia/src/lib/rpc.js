/**
 * Llamadas a funciones de `api`.
 *
 * Toda regla de negocio vive en el servidor: acá sólo se traduce el
 * error a algo que una persona pueda leer. Si el front decidiera qué
 * está permitido, bastaría con abrir la consola para saltárselo.
 */
import { supabase } from './supabase.js'

const MENSAJES = {
  sin_permiso: 'Tu usuario no tiene permiso para hacer esto.',
  sin_permiso_costo: 'No tienes acceso a los costos.',
  capacidad_desactivada: 'Esta función no está contratada para tu empresa.',
  suscripcion_inactiva: 'La suscripción no está vigente. Contacta a Black Sheep.',
  ciclo_en_curso: 'Hay otra carga corriendo. Espera a que termine.',
  lote_no_disponible: 'Esta carga ya no se puede procesar.',
  lote_no_encontrado: 'No se encontró la carga.',
  lote_no_publicado: 'Esta carga no está publicada.',
  producto_inexistente: 'Ese producto no existe. Créalo antes de ponerle precio.',
  cliente_no_encontrado: 'No se encontró ese cliente.',
  tipo_archivo_invalido: 'Ese tipo de archivo no es uno de los cuatro.',
  pedido_vacio: 'El pedido no tiene líneas.',
  sin_precio: 'Indica al menos un precio: unidad, caja o kilo.',
  costo_invalido: 'El costo tiene que ser un número mayor o igual a cero.',
  cliente_key_requerido: 'Falta el RUT o código del cliente.',
  filas_debe_ser_arreglo: 'El archivo no se pudo leer como filas.',
}

export class ErrorRpc extends Error {
  constructor(mensaje, original) {
    super(mensaje)
    this.name = 'ErrorRpc'
    this.original = original
    this.code = original?.code
  }
}

export async function llamar(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    // El servidor levanta excepciones con nombres estables
    // (sin_permiso, ciclo_en_curso…). Se buscan en el texto.
    const clave = Object.keys(MENSAJES).find((k) => (error.message || '').includes(k))
    const hint = error.hint ? ` ${error.hint}` : ''
    throw new ErrorRpc((clave ? MENSAJES[clave] : error.message) + hint, error)
  }
  return data
}
