import { supabase } from '../../lib/supabase.js'

export async function createAction({ clienteId, tipo, prioridad = 'media', nota = '' }) {
  if (!clienteId || !tipo) throw new Error('clienteId y tipo son obligatorios')
  const payload = { cliente_id: clienteId, tipo, prioridad, nota }
  const { data, error } = await supabase.from('acciones_comerciales').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function assignExecutive({ clienteId, ejecutivoId }) {
  if (!clienteId || !ejecutivoId) throw new Error('clienteId y ejecutivoId son obligatorios')
  const { data, error } = await supabase.from('cartera').update({ ejecutivo_id: ejecutivoId }).eq('cliente_id', clienteId).select().single()
  if (error) throw error
  return data
}
