# Deploy KeyFoods Field (para que el celular vea los cambios)

## Problema actual
Producción (`keyfoods-field.vercel.app`) todavía sirve un JS con headers **azules** en Visita.
El código nuevo es **naranja/terracota** y muestra el sello `2026-08-14-precio` abajo a la derecha.

Si en el celular NO ves ese sello → **no subió el deploy**.

## Pasos (GitHub → Vercel)

1. Bajá el zip `keyfoods-field-PRECIO-UX.zip`
2. En el repo de GitHub (branch `main`):
   - Borrá el contenido viejo de `src/` (o reemplazá archivo por archivo)
   - Subí TODO el contenido del zip en la **raíz** del repo
   - Tiene que existir: `package.json` con `"version": "0.3.1-precio"`
3. Commit message: `precio dinamico + visita terracota 2026-08-14`
4. Push a `main`
5. En Vercel → Deployments:
   - Esperá el build **Ready** (Node 24)
   - Si el de arriba no es Production: ⋯ → **Promote to Production**
6. En el celular:
   - Cerrá todas las pestañas del sitio
   - Chrome: candado → permisos → restablecer ubicación si estaba bloqueado
   - Abrí de nuevo `https://keyfoods-field.vercel.app`
   - Buscá el texto chico **`2026-08-14-precio`** abajo a la derecha
   - Visita debe verse **naranja**, no azul

## GPS solo en PC, no en celular
1. Tiene que ser **HTTPS** (Vercel ya lo es)
2. En Android Chrome: Permisos del sitio → Ubicación → Permitir
3. En iPhone Safari: Ajustes → Safari → Ubicación → Permitir / Preguntar
4. Si antes tocaste “Bloquear”, hay que resetear el permiso del sitio
5. El GPS del browser en iOS es más débil que una app nativa; para precisión de calle a futuro: Capacitor

## SQL una vez (pedidos / gerencia)
Correr en Supabase SQL Editor el archivo `SUPABASE_FIX_GERENCIA_Y_PEDIDOS.sql`
