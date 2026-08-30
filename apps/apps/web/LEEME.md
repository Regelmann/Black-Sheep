# black-sheep.cl — sitio comercial

**Reemplaza a la web estática anterior.** Next.js 15 + Tailwind +
framer-motion, en el mismo repo.

## Un repo, dos proyectos de Vercel

No es trabajo aparte: es **una configuración**, no un segundo repositorio.

| Proyecto | Root Directory | Dominio |
|---|---|---|
| Field (existente) | `apps/field` | `app.black-sheep.cl` |
| Web (este) | `apps/web` | `black-sheep.cl` |

Vercel soporta varios proyectos desde un mismo repo, cada uno con su Root
Directory. Un `git push` despliega los dos.

**Por qué no un solo proyecto:** `apps/field` es Vite y `apps/web` es Next.
Compartir `node_modules` traería conflictos de versión de React sin ganar
nada.

## Funciona SIN base de datos

`api/leads` importa Postgres **sólo si existe `DATABASE_URL`**. Sin esa
variable el lead queda en los logs de Vercel y el formulario confirma igual.

**Para el lunes no hay que configurar nada.**

Cuando quieras persistir de verdad, apuntá `DATABASE_URL` a la **misma
Postgres de Supabase** que ya usa la app. Un solo lugar donde mirar los leads.

## 🔴 Dos bugs que impedían desplegar

**1 · `api/health` rompía el build.** Importaba la DB a nivel de módulo, y
`db/index.ts` hace `throw` si falta `DATABASE_URL`. Next recolecta datos de
página en tiempo de build, así que el deploy fallaba con *"Failed to collect
page data for /api/health"* — justo en el caso normal, sin base configurada.

Una ruta de diagnóstico no puede impedir que el sitio se publique.

**2 · Las fuentes rompían el build.** `next/font/google` las descarga en
tiempo de build. Si Google no responde —corte de red, timeout, bloqueo
regional— el deploy entero cae con *"Failed to fetch Space Grotesk"*.

Ahora se cargan por `<link>` con `display=swap`: si no llegan, el sitio se ve
con la fuente del sistema y **se publica igual**. Un sitio comercial no puede
quedar sin desplegar porque un CDN de fuentes tuvo un mal minuto.

## Links viejos que se conservan

`login.html` y `dashboard.html` de la web anterior eran archivos de 16-23
líneas que sólo redirigían a la app. Se conservan como redirect 308 en
`next.config.ts`, para que un mail viejo, un marcador o un QR impreso no
mueran en un 404.
