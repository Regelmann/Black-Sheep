# Black Sheep Platform — v2.4 READY

Monorepo listo para producción.

```
Black-Sheep/
├── apps/
│   ├── field/          → app.black-sheep.cl  (React/Vite, stamp v-BS-PLATFORM-V2.4)
│   └── web/            → black-sheep.cl      (landing + login estático)
├── scripts/
│   ├── KEYFOODS_CICLO_UNICO.py   ← ÚNICO script de ciclo (v1.33)
│   ├── descargar_excel_drive.py
│   └── KEYFOODS_PATCH_STOCK_PRECIOS.py
├── sql/                ← correr en orden 01 → 09 (solo lo necesario)
├── brand/              ← logos PNG/SVG
├── docs/
├── DEPLOY.md           ← pasos Vercel + Supabase + ciclo
└── package.json
```

## Qué incluye (hasta V2.4)

| Módulo | Estado |
|--------|--------|
| Field app (Hoy, Mapa, Visita, Cartera, Stock, Gerencia) | ✅ |
| Visita capture-first (un CTA, sticky cerrar) | ✅ V2.3 |
| Smart Reorder (Se le acaba · qty) | ✅ V2.4 |
| Mapa GPS-first + zonas comunas | ✅ V2.2 |
| Precios dinámicos + catálogo web cliente | ✅ |
| Multi-tenant (KeyFoods) | ✅ |
| Ciclo único incremental v1.33 | ✅ |
| SQL canónico commerce / riesgo / pedidos | ✅ |
| Landing black-sheep.cl | ✅ |

## Dos deploys Vercel

| URL | Root Directory | Build |
|-----|----------------|-------|
| **app.black-sheep.cl** | `apps/field` | `npm install --legacy-peer-deps` → `npm run build` → `dist` |
| **black-sheep.cl** | `apps/web` | estático (sin build) |

## Variables Field (Vercel → Settings → Env)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
```

## Ciclo diario

Un solo archivo: `scripts/KEYFOODS_CICLO_UNICO.py` (versión **CICLO_UNICO_v1.33**).

Ver `DEPLOY.md` sección Ciclo.

## SQL

Correr en Supabase SQL Editor **en orden numérico** (`sql/01_...` → `sql/09_...`).
Detalle en `sql/README.md`.
