/**
 * admin-usuarios · Edge Function
 *
 * POR QUÉ EXISTE ESTO Y NO SE HACE DESDE EL NAVEGADOR
 * Crear usuarios, resetear contraseñas y bloquear cuentas son
 * operaciones de la Admin API de Supabase, y exigen la `service_role`.
 * Esa llave abre TODA la base de TODAS las empresas, sin RLS. Si viaja
 * al navegador, cualquiera que abra la consola se la lleva.
 *
 * Acá vive en una variable de entorno del servidor. El navegador manda
 * el token del superadmin; esta función lo verifica contra la base
 * antes de hacer nada.
 *
 * Desplegar:  supabase functions deploy admin-usuarios
 * Secretos:   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (los pone Supabase)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/**
 * Contraseña legible en voz alta.
 *
 * Sin caracteres ambiguos: la contraseña se dicta por teléfono a un
 * vendedor que la escribe en el celular. Una l y un 1, o un 0 y una O,
 * generan una llamada de vuelta. 4 grupos de 4 desde un alfabeto de 30
 * dan ~78 bits: sobra para algo que además se cambia al primer ingreso.
 */
function generarClave(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // sin I, O, 0, 1
  const bytes = new Uint32Array(16)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => alfabeto[b % alfabeto.length])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'sin_token' }, 401)

    // 1 · ¿Quién llama? Se pregunta con SU token, no con la service_role.
    const comoUsuario = createClient(URL, ANON, {
      global: { headers: { Authorization: auth } },
    })
    const { data: { user }, error: eUser } = await comoUsuario.auth.getUser()
    if (eUser || !user) return json({ error: 'token_invalido' }, 401)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    // 2 · ¿Es superadmin? Se verifica contra la BASE, no contra un claim
    //     del token: un claim viejo seguiría abriendo la puerta después
    //     de que le quitaran el privilegio.
    const { data: sa } = await admin
      .schema('platform').from('superadmin')
      .select('usuario_id').eq('usuario_id', user.id).maybeSingle()
    if (!sa) return json({ error: 'sin_permiso' }, 403)

    const { accion, tenant_id, email, nombre, rol, usuario_id, motivo } = await req.json()

    switch (accion) {
      /* ─── Crear un usuario con contraseña generada ───────────────── */
      case 'crear': {
        if (!email || !tenant_id || !rol) return json({ error: 'faltan_datos' }, 400)
        const clave = generarClave()

        const { data: creado, error } = await admin.auth.admin.createUser({
          email,
          password: clave,
          email_confirm: true,          // no se le pide confirmar por correo
          user_metadata: { nombre: nombre ?? null },
        })
        if (error) {
          // Ya existía: se le asigna la empresa igual, sin tocar su clave.
          if (String(error.message).includes('already')) {
            const { data: existente } = await admin.auth.admin.listUsers()
            const u = existente?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())
            if (!u) return json({ error: error.message }, 400)
            await admin.schema('platform').from('membresias')
              .upsert({ usuario_id: u.id, tenant_id, rol, activo: true })
            return json({ ok: true, ya_existia: true, usuario_id: u.id })
          }
          return json({ error: error.message }, 400)
        }

        await admin.schema('platform').from('usuarios')
          .upsert({ id: creado.user.id, email, nombre: nombre ?? null })
        await admin.schema('platform').from('membresias')
          .upsert({ usuario_id: creado.user.id, tenant_id, rol, activo: true })

        // La contraseña se devuelve UNA vez. No se guarda en ningún lado:
        // si se pierde, se genera otra. Guardarla para "por si acaso" es
        // como se filtran las credenciales.
        return json({ ok: true, usuario_id: creado.user.id, clave })
      }

      /* ─── Nueva contraseña ───────────────────────────────────────── */
      case 'resetear': {
        if (!usuario_id) return json({ error: 'faltan_datos' }, 400)
        const clave = generarClave()
        const { error } = await admin.auth.admin.updateUserById(usuario_id, { password: clave })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true, clave })
      }

      /* ─── Correo para que la cambie él mismo ─────────────────────── */
      case 'enviar_enlace': {
        if (!email) return json({ error: 'faltan_datos' }, 400)
        const { error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }

      /* ─── Bloquear y desbloquear ─────────────────────────────────── */
      case 'bloquear': {
        if (!usuario_id) return json({ error: 'faltan_datos' }, 400)
        // 100 años: la Admin API no tiene "para siempre".
        const { error } = await admin.auth.admin.updateUserById(usuario_id, {
          ban_duration: '876000h',
        })
        if (error) return json({ error: error.message }, 400)
        // Además se desactiva la membresía: la sesión que ya tenga abierta
        // deja de ver datos en el próximo refresh del token.
        if (tenant_id) {
          await admin.schema('platform').from('membresias')
            .update({ activo: false }).eq('usuario_id', usuario_id).eq('tenant_id', tenant_id)
        }
        return json({ ok: true })
      }

      case 'desbloquear': {
        if (!usuario_id) return json({ error: 'faltan_datos' }, 400)
        const { error } = await admin.auth.admin.updateUserById(usuario_id, { ban_duration: 'none' })
        if (error) return json({ error: error.message }, 400)
        if (tenant_id) {
          await admin.schema('platform').from('membresias')
            .update({ activo: true }).eq('usuario_id', usuario_id).eq('tenant_id', tenant_id)
        }
        return json({ ok: true })
      }

      default:
        return json({ error: 'accion_desconocida' }, 400)
    }
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
