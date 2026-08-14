# KeyFoods Field

App PWA de terreno para ejecutivos comerciales KeyFoods.

- **Stack:** React 18 + Vite + Supabase + Google Maps
- **Deploy:** Vercel
- **Datos:** BigQuery (gold) → script de bajada → Supabase

## Pantallas

| Ruta | Descripción |
|------|-------------|
| `/` | Ruta del día + mapa (clientes / prospectos / paradas) |
| `/visita/:id` | Detalle de visita, check-in, navegar |
| `/cartera` | Cartera del ejecutivo (MTD, estados, oferta, SKUs) |
| `/metas` | Meta mensual + focos del ejecutivo |
| `/stock` | Stock operativo (unidad origen + cobertura días) |
| `/gerencia` | Vista global (solo superadmin / gerente) |

## Variables de entorno (Vercel / `.env`)

```
VITE_SUPABASE_URL=https://ihhnfouwviuyycltgafc.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_GOOGLE_MAPS_API_KEY=tu_maps_key
```

Copiá `.env.example` → `.env` en local. En Vercel: Project → Settings → Environment Variables.

**Nunca** subas la `service_role` de Supabase al front.

## Desarrollo local

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

## Deploy a Vercel (GitHub)

1. Subí este repo a GitHub (sin `node_modules`, sin `.env`).
2. En Vercel → New Project → Import del repo.
3. Framework: Vite (auto).
4. Cargá las 3 variables `VITE_*`.
5. Deploy. Si no ves cambios: Deployments → Promote to Production + hard refresh en el celular.

## Bajada de datos (Colab)

Script canónico: `scripts/KEYFOODS_FIELD_BAJADA.py` (v8.13b).

```python
# Secrets Colab (Notebook access ON):
#   SUPABASE_SERVICE_KEY
%run ".../scripts/KEYFOODS_FIELD_BAJADA.py"
```

No toca: `notas_cliente`, `pedidos`, `checkins`, `auth`.

## RLS prospectos (una sola vez en Supabase SQL)

```sql
-- scripts/SUPABASE_FIX_PROSPECTOS_RLS.sql
```

## Multi-ejecutivo

- Cada usuario Auth de Supabase está en tabla `ejecutivos` (id, email, zona, nombre).
- Superadmin ve selector de zona (NOR-ORIENTE / NOR-PONIENTE / ZONA SUR).
- El resto solo ve su zona (`eidVista` / `zonaVista` vía contexto).

## Estructura

```
src/
  App.jsx              # auth, contexto ejecutivo, rutas
  components.jsx       # NavBar, money, pctNum
  index.css            # design system KeyFoods
  main.jsx
  lib/
    supabase.js
    geo.js
    places.js
    ui.js
  pages/
    Ruta.jsx  Cartera.jsx  Metas.jsx
    Stock.jsx Gerencia.jsx Visita.jsx Login.jsx
scripts/
  KEYFOODS_FIELD_BAJADA.py
  SUPABASE_FIX_PROSPECTOS_RLS.sql
```
