# Black Sheep Field — Arquitectura multi-empresa

## Idea

**Una marca, un producto, muchas empresas.**

```
black-sheep.cl              → marketing + puerta de ingreso
        │
        ▼ login (elige / resuelve empresa)
        │
app.black-sheep.cl          → misma app Field (código único)
        │
        ├── tenant KeyFoods  → Supabase proyecto A (datos KeyFoods)
        ├── tenant Demo      → Supabase proyecto B
        └── tenant Empresa N → Supabase proyecto N
```

Black Sheep controla el producto (UI, catálogo, pedido, gerencia, ciclo).
Cada empresa solo ve **sus** datos.

## Tres planos

| Plano | Qué es | Dónde vive |
|-------|--------|------------|
| **Producto** | Pantallas, precio, pedido, reposición | `apps/field` (un deploy) |
| **Tenant** | Nombre, Supabase URL, features, dominios | `src/lib/tenants.js` + env |
| **Datos** | Stock, precios, clientes, pedidos | Proyecto Supabase por empresa |

## Flujo de login

1. Usuario entra a **black-sheep.cl** → Ingresar.
2. Elige empresa (o se infiere por correo `@keyfoods.cl`).
3. Redirige a **app.black-sheep.cl?tenant=keyfoods&email=...**
4. La app hace `initSupabase(tenant)` y `signInWithPassword` contra el Supabase de esa empresa.
5. Sesión persistida por tenant (`bs-auth-keyfoods`, etc.).

## Cómo agregar una empresa nueva

1. Crear proyecto Supabase (o schema dedicado en fase 2).
2. Correr SQL canónico:
   - `SUPABASE_FIX_STOCK_PRECIOS.sql`
   - `SUPABASE_COMMERCE_V56_16_CANON.sql`
3. Crear usuarios Auth (ejecutivos) + filas en `ejecutivos`.
4. Agregar entrada en `apps/field/src/lib/tenants.js`:
   ```js
   {
     id: 'nueva',
     name: 'Nueva Empresa',
     domains: ['nueva.cl'],
     emailHints: ['nueva'],
     supabaseUrl: env('VITE_TENANT_NUEVA_URL'),
     supabaseAnon: env('VITE_TENANT_NUEVA_ANON_KEY'),
     features: { gerencia: true, catalogo: true, mapa: true, commerce: true },
   }
   ```
5. En Vercel, variables:
   ```
   VITE_TENANT_NUEVA_URL=...
   VITE_TENANT_NUEVA_ANON_KEY=...
   ```
6. Cargar precios con `KEYFOODS_PATCH_STOCK_PRECIOS.py` (apuntando al proyecto de esa empresa).

## Fase 1 vs Fase 2

**Fase 1 (ahora):** 1 Supabase por empresa. Aislamiento total. Escala a decenas de clientes sin reescribir RLS.

**Fase 2 (después):** un solo proyecto + `tenant_id` en todas las tablas + RLS estricto. Tiene sentido con muchos tenants y un equipo de ops central.

## Qué no se comparte entre empresas

- Clientes, ventas, stock, pedidos, ofertas, ejecutivos
- Service role / secrets de ciclo

## Qué sí se comparte

- Código de la app Field
- Landing black-sheep.cl
- Brand Black Sheep
- Lógica de precios, catálogo, reposición

## Dominios recomendados

| Host | Proyecto Vercel | Root |
|------|-----------------|------|
| black-sheep.cl | web | `apps/web` |
| app.black-sheep.cl | field | `apps/field` |

Opcional después: `keyfoods.app.black-sheep.cl` (subdominio = tenant).
