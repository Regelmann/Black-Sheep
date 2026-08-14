# Deploy lean (el lock que te funcionaba)

## Por qué
El lock con Tailwind/postcss colgaba npm en Vercel ~8 min.
Este paquete usa **tu package-lock 0.2.0** (solo react + vite + supabase) = ~75 paquetes, install ~5s.

## Pasos
1. Subí TODO a la raíz de Black-Sheep (package.json + package-lock.json + src/).
2. Vercel → Redeploy **sin** Use existing Build Cache.
3. Node 24.x · Root Directory vacío.
4. Login debe mostrar **v-LEAN-020**.

Env en Vercel (si hace falta):
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_GOOGLE_MAPS_API_KEY (opcional)
