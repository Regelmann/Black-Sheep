# admin-usuarios

Alta, reseteo y bloqueo de usuarios. Vive acá y no en el navegador
porque necesita la `service_role`, que abre toda la base de todas las
empresas sin pasar por RLS.

## Desplegar

```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase functions deploy admin-usuarios
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los
inyecta Supabase solo. No hay que configurarlos.

## Cómo verifica quién llama

1. Recibe el token del navegador y pregunta **con ese token** quién es.
2. Comprueba contra `platform.superadmin` que esa persona opera la
   plataforma.

El segundo paso mira la **base**, no el claim del token. Un token viejo
seguiría trayendo `rol_plataforma: superadmin` durante una hora después
de que le quitaran el privilegio.

## Las contraseñas

Se generan con `crypto.getRandomValues` en cuatro grupos de cuatro, de
un alfabeto sin caracteres ambiguos: sin I, O, 0 ni 1. La contraseña se
dicta por teléfono a un vendedor que la escribe en el celular, y una `l`
confundida con un `1` es una llamada de vuelta.

Son ~78 bits de entropía. Se muestran **una sola vez** y no se guardan
en ninguna parte: si se pierde, se genera otra. Guardarla "por si
acaso" es exactamente cómo se filtran las credenciales.
