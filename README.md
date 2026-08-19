# KeyFoods Field · V56.16 CANON

App PWA de terreno + catálogo público de reposición.

**Build stamp:** `v-BS-V56.16-CANON`

## Stack

React 18 + Vite + Supabase + Google Maps · Deploy Vercel

## Pantallas field

| Ruta | Uso |
|------|-----|
| `/` | Ruta del día |
| `/visita/:id` | Check-in / visita |
| `/cartera` | Cartera + oferta |
| `/metas` | Metas y focos |
| `/stock` | Stock operativo |
| `/gerencia` | Vista global |
| `/c/:token` | Catálogo público del cliente |

## Variables

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
```

## Deploy

Ver `V56.16_CANON_RELEASE.md` (SQL → precios → front).

## Producción de datos

```bash
# Colab / CI
python scripts/KEYFOODS_CICLO_PRODUCCION.py
```

Incluye bajada BQ, patch precios v5 y media opcional.
