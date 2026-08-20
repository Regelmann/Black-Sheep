# Black Sheep Field — Go-Live al 100%

Stamp objetivo: `v-BS-PLATFORM-V2`

## Estado del código

- Build Vite: OK (verificado)
- Multi-tenant: OK (`tenants.js` + login)
- Comercio CANON SQL: incluido
- Patch precios v5: incluido
- PedidoSheet import: corregido

## Secuencia obligatoria (en este orden)

### A. Deploy app (Vercel)

1. Repo con V2 fixed pusheado (`sregelmann@gmail.com` como git email)
2. Root Directory = `apps/field`
3. Env Production:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY` (opcional mapa)
   - `VITE_PUBLIC_BRAND=KEYFOODS` (catálogo web del tenant)
4. Deploy **Ready** → hard refresh → ver stamp `v-BS-PLATFORM-V2`

### B. Supabase (proyecto KeyFoods)

En SQL Editor, en orden:

1. `apps/field/scripts/SUPABASE_FIX_STOCK_PRECIOS.sql`
2. `apps/field/scripts/SUPABASE_COMMERCE_V56_16_CANON.sql`
3. Opcional: `SUPABASE_HEALTH_COMMERCE.sql`

### C. Precios (sin esto el catálogo no tiene lista)

Colab / máquina con service key:

```python
import os
os.environ["KF_PRECIOS_XLSX"] = "/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2/LISTA DE PRECIOS AGOSTO.xlsx"
os.environ["KF_DATA_DIR"] = "/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2"
# Secrets: SUPABASE_URL + SUPABASE_SERVICE_KEY
%run apps/field/scripts/KEYFOODS_PATCH_STOCK_PRECIOS.py
```

Verificar:

```sql
select
  count(*) filter (where coalesce(precio_unidad,0)>0
    or coalesce(precio_caja,0)>0
    or coalesce(precio_kilo,0)>0) as con_precio,
  count(*) as total
from stock;
```

Objetivo: `con_precio` >> 0 (antes ~90/144).

### D. Smoke test (30 min)

| # | Prueba | OK |
|---|--------|----|
| 1 | Login ejecutivo | |
| 2 | Hoy carga métricas / cartera | |
| 3 | Cliente → Oferta → link catálogo | |
| 4 | Catálogo muestra productos con precio | |
| 5 | Pedido web llega a Hoy / historial | |
| 6 | Pedido en terreno desde ficha | |
| 7 | Stock muestra precios | |
| 8 | Gerencia zona abre | |

### E. Sitio black-sheep.cl (segundo proyecto Vercel)

- Root: `apps/web`
- En `login.html`: `window.BS_APP_URL = "https://TU-APP.vercel.app"`

## Qué NO es bloqueante para KeyFoods en producción

- Tenant Demo (segundo Supabase)
- Code-split del bundle 650kb
- TimeFM / BQ gold
- Panel admin para crear tenants sin código

## Si algo falla

| Síntoma | Acción |
|---------|--------|
| Missing script build | Root Directory = `apps/field` |
| index.html not found | Idem |
| PedidoSheet Expected "as" | Usar V2_FIXED PedidoSheet.jsx |
| Deploy Blocked email | `git config user.email sregelmann@gmail.com` |
| con_precio = 0 | Correr PATCH_STOCK_PRECIOS_v5 |
| Catálogo vacío | Precios + SQL CANON + oferta con link |
