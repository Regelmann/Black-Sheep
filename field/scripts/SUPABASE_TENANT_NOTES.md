# Notas multi-tenant

Fase 1 no requiere tabla `tenants` en cada proyecto Supabase:
el registro vive en el código (`tenants.js`) + env de Vercel.

Opcional (control plane futuro, un solo DB Black Sheep):

```sql
create table if not exists public.bs_tenants (
  id text primary key,
  name text not null,
  slug text unique not null,
  supabase_url text,
  active boolean default true,
  created_at timestamptz default now()
);
```

Los datos operativos (cartera, stock, pedidos) siguen en el proyecto de cada empresa.
