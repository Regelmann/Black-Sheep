import { supabase } from '../../lib/supabase.js'

export async function createAction({ clienteId, tipo, prioridad = 'media', nota = '' }) {
  if (!clienteId || !tipo) throw new Error('clienteId y tipo son obligatorios')
  throw new Error('acciones_comerciales aún no está confirmada en el esquema. No se ejecutó ninguna escritura.')
}

export async function assignExecutive({ clienteId, ejecutivoId }) {
  if (!clienteId || !ejecutivoId) throw new Error('clienteId y ejecutivoId son obligatorios')
  const { data, error } = await supabase.from('cartera').update({ ejecutivo_id: ejecutivoId }).eq('cliente_id', clienteId).select().single()
  if (error) throw error
  return data
}

export async function blockClient({ clienteId, motivo = '' }) {
  if (!clienteId) throw new Error('clienteId es obligatorio')
  throw new Error('bloqueo de clientes aún no está confirmado en el esquema. No se ejecutó ninguna escritura.')
}

export async function publishCatalog({ clienteId }) {
  if (!clienteId) throw new Error('clienteId es obligatorio')
  throw new Error('publicación de catálogo aún no está confirmada en el esquema. No se ejecutó ninguna escritura.')
}
