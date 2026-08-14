# KeyFoods Field

App PWA de terreno (React + Vite + Supabase).  
Versión limpia: **0.3.1-precio** · sello en UI: `2026-08-14-precio`

## Qué incluye
- Ruta (mapa + cerca de mí)
- Cartera (reponer, mix, pedido con precio del cliente)
- Visita (check-in, encuesta, pedido)
- Metas, Stock, Gerencia
- Colores marca (terracota), no el tema azul viejo

## Variables (`.env`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
```

## Local
```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run dev
```

## GitHub nuevo + Vercel (desde cero)

### A) GitHub
1. github.com → **New repository** (vacío, sin README)
2. Nombre sugerido: `keyfoods-field`
3. Subí **todo** este proyecto a la **raíz** del repo (no dentro de una carpeta extra)

Con GitHub Desktop / web “Upload files”, o:
```bash
git init
git add .
git commit -m "KeyFoods Field 0.3.1-precio — repo limpio"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/keyfoods-field.git
git push -u origin main
```

### B) Vercel
1. vercel.com → **Add New Project** → importá `keyfoods-field`
2. Framework: **Vite**
3. Node: **24.x** (Project Settings → General)
4. Install: `npm install --legacy-peer-deps` (ya está en vercel.json)
5. Environment Variables (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
6. Deploy

### C) Verificar
En el celular, abajo a la derecha debe verse: **`2026-08-14-precio`**  
Visita = header **naranja**, no azul. Si no: el dominio viejo o caché.

Podés desconectar el proyecto Vercel anterior y apuntar el dominio `keyfoods-field.vercel.app` al proyecto nuevo (Settings → Domains).

## Supabase (SQL una vez)
`scripts/SUPABASE_FIX_GERENCIA_Y_PEDIDOS.sql` en el SQL Editor.

## Datos
Colab: `KEYFOODS_CICLO_LIMPIO` → Supabase. La app solo lee tablas.
