# Deploy Black Sheep — guía única

## 1. Subir a GitHub

```bash
cd ~/Documents
# si ya tenés el repo:
cd Black-Sheep
# pegá el contenido de este zip encima (reemplazando apps/, scripts/, sql/)

git add -A
git status
git commit -m "platform: V2.4 ready — field Smart Reorder + ciclo v1.33 + sql canon"
git push
```

## 2. Vercel — App de campo (app.black-sheep.cl)

1. Proyecto Vercel → Settings → General  
   - **Root Directory:** `apps/field`  
2. Build & Development:
   - Install: `npm install --legacy-peer-deps --no-audit --no-fund`
   - Build: `npm run build`
   - Output: `dist`
3. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
4. Domain: `app.black-sheep.cl`
5. Deploy. En el teléfono debe verse el stamp **`v-BS-PLATFORM-V2.4`**.

## 3. Vercel — Web / landing (black-sheep.cl)

1. Otro proyecto (o el mismo con otro root)  
   - **Root Directory:** `apps/web`  
2. Framework: Other (estático)  
3. Domain: `black-sheep.cl` y `www.black-sheep.cl`  
4. `login.html` puede redirigir a app.black-sheep.cl

## 4. Supabase SQL (una vez por tenant)

SQL Editor → correr en orden:

```
sql/01_COMMERCE_CANON.sql
sql/02_RIESGO_FUGA.sql
sql/03_PEDIDOS_HISTORIAL.sql
sql/04_ORDER_BRIDGE.sql
sql/05_CATALOGO_PUBLICO.sql
sql/06_ENCUESTAS_VISITA.sql
sql/07_STOCK_PRECIOS.sql
sql/08_PROSPECTOS_RLS.sql
sql/09_ES_NUEVO_MES.sql
```

## 5. Ciclo único (datos diarios)

Archivo: `scripts/KEYFOODS_CICLO_UNICO.py` (**CICLO_UNICO_v1.33**)

### Colab (manual)

1. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_MAPS_API_KEY`
2. Excel en Drive o subidos: VENTAS, MAESTRA, STOCK, LISTA PRECIOS, CONFIG_MES
3. Opcional:
   ```python
   import os
   os.environ["KF_SKIP_PLACES"] = "1"   # sin Places (rápido)
   # os.environ["KF_FORCE_VENTAS"] = "1"  # solo si validación MTD lo pide
   ```
4. `%run scripts/KEYFOODS_CICLO_UNICO.py`  
5. Debe terminar en `LISTO CICLO_UNICO_v1.33`

### GitHub Actions (automático)

Ver `apps/field/SETUP_GITHUB_ACTIONS.md` si está presente.  
Secrets mínimos: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE service account para Drive.

## 6. Verificación rápida

- [ ] app.black-sheep.cl muestra `v-BS-PLATFORM-V2.4`
- [ ] Hoy carga métricas y action queue
- [ ] Visita: un solo “Tomar pedido” + sticky completar
- [ ] Mapa: botón 📍 centra en GPS
- [ ] Smart Reorder: “Se le acaba” / cantidades en Qué ofrecer
- [ ] Ciclo publica cartera + gerencia sin duplicar ventas
- [ ] black-sheep.cl landing OK

## Estructura — qué NO está (a propósito)

- No hay 20 scripts de ciclo viejos (solo `KEYFOODS_CICLO_UNICO.py`)
- No hay SQL V56.3 + V56.4 duplicados (solo `sql/01` canon)
- No hay zips intermedios de UX dentro del repo

## Rollback
Si un deploy falla: ver **docs/ROLLBACK.md** (Vercel Promote + SQL 05/01).
