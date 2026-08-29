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
