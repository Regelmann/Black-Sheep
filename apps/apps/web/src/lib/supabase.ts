import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el dashboard de gerencia.
 *
 * Usa la ANON KEY, no la service key: el dashboard lee lo mismo que la app,
 * protegido por RLS. Una service key en el navegador sería una fuga total.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && key);

export const supabase =
  supabaseConfigurado
    ? createClient(url as string, key as string, { auth: { persistSession: true } })
    : null;
