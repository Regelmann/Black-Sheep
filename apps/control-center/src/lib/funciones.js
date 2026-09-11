/**
 * Llamadas a Edge Functions.
 *
 * Se separan de `rpc.js` a propósito: una función de base de datos y una
 * función de servidor fallan distinto, y mezclarlas hace que un error de
 * despliegue parezca un error de permisos.
 */
import { supabase } from '../../../../packages/datos/supabase.js'

const MENSAJES = {
  sin_token: 'Tu sesión expiró. Vuelve a entrar.',
  token_invalido: 'Tu sesión expiró. Vuelve a entrar.',
  sin_permiso: 'Tu cuenta no opera la plataforma.',
  faltan_datos: 'Faltan datos para completar la operación.',
  accion_desconocida: 'Esa operación no existe.',
}

export async function llamarFuncion(nombre, cuerpo) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(MENSAJES.sin_token)

  const { data, error } = await supabase.functions.invoke(nombre, {
    body: cuerpo,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    // Un 404 acá casi siempre significa que la función no está desplegada,
    // no que el usuario haya hecho algo mal. Decirlo ahorra media hora.
    if (String(error.message).includes('404') || String(error.message).includes('not found')) {
      throw new Error(
        'La función admin-usuarios no está desplegada. ' +
        'Corre: npx supabase functions deploy admin-usuarios',
      )
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(MENSAJES[data.error] || data.error)
  return data
}
