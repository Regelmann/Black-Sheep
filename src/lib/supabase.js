import { createClient } from '@supabase/supabase-js'

// La ANON key es publica y respeta la seguridad por fila (RLS) de Supabase.
// Cada ejecutivo, al iniciar sesion, solo ve y toca sus propios datos.
// NUNCA usar la service_role key aca: esa saltea la seguridad y es solo para
// el proceso de bajada del lado servidor.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env')
}

export const supabase = createClient(url, anonKey)
