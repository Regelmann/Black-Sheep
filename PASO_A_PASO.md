# BLACK SHEEP · V8.0 FIX

Stamp: `v-BS-PLATFORM-V8.0-FIX`

## Urgente — Supabase (catálogo roto)

En SQL Editor corré **ya**:

`sql/01_FIX_CATALOGO_ACTIVA.sql`

Eso crea columnas `activa` / `activo` y reemplaza `get_public_catalogo`.

Sin ese SQL el link del catálogo sigue diciendo: column "activa" does not exist.

## Qué arregla este paquete

1. **Catálogo web** — SQL + RPC + mensaje claro en app
2. **Stock compradores** — match por nombre más flexible + productos_top
3. **Focos / avance SKU en Hoy** — barras de % meta vs vendido
4. **Oferta** — graba `activo` y `activa` al crear catálogo
5. Stamp V8.0-FIX

## Deploy

1. Supabase → Run `01_FIX_CATALOGO_ACTIVA.sql`
2. Copiar zip encima del repo
3. git add / commit / push
4. Hard refresh app

## Dashboard

`black-sheep.cl/dashboard` redirige a la app de campo (Gerencia está en Más → Gerencia).
Un dashboard desktop aparte se puede sumar después; hoy la data vive en la app.

## Checklist post-fix

| Item | Check |
|------|--------|
| Catálogo link | Abre productos, no error activa |
| Stock → Encontrar compradores | >0 si hay historial del SKU |
| Hoy → Focos del mes | Barras si hay filas en tabla focos |
| Cartera | Sin cambios de lógica |
