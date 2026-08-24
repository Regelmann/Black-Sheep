# BLACK SHEEP — Paso a paso (archivo limpio)

Stamp app: `v-BS-PLATFORM-V7.9.1-CSS`

Este paquete trae **solo** lo necesario:
- `apps/field` → app terreno (Vercel: app.black-sheep.cl)
- `apps/web` → landing (Vercel: black-sheep.cl)
- `scripts/CICLO_UNICO.py` → un solo script de datos
- `sql/00_CANON_MINIMO.sql` → tablas/columnas mínimas
- `brand/` → logos

---

## 0. Qué necesitás

| Cosa | Dónde |
|------|--------|
| Cuenta Supabase del tenant (KeyFoods) | supabase.com |
| Repo GitHub | Regelmann/Black-Sheep |
| Vercel (2 proyectos o monorepo) | app + web |
| Excel en Drive | VENTAS, MAESTRA, STOCK, LISTA PRECIOS, CONFIG mes |
| Secrets ciclo | SUPABASE_URL + SUPABASE_SERVICE_KEY |

---

## 1. Supabase (una sola vez o si faltan tablas)

1. Abrí **Supabase → SQL Editor**.
2. Pegá todo el archivo `sql/00_CANON_MINIMO.sql`.
3. **Run**.
4. Verificá:

```sql
select count(*) as stock from stock;
select count(*) as cartera from cartera;
select count(*) filter (where coalesce(precio_unidad,0) > 0) as stock_con_precio from stock;
```

- Si `stock` / `cartera` dan 0 → falta correr el **ciclo** (paso 3).
- Si `stock_con_precio` = 0 después del ciclo → el Excel de lista de precios no se cruzó.

**No hace falta** correr los SQL viejos 01–17 si ya corrés este canón (es idempotente).

---

## 2. Variables de la app (field)

En Vercel del proyecto **field** (Root Directory = `apps/field` si monorepo):

```
VITE_SUPABASE_URL=https://XXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Archivo local de referencia: `apps/field/.env.example`.

Build command: `npm run build`  
Output: `dist`

---

## 3. Ciclo de datos (diario)

Archivo único: `scripts/CICLO_UNICO.py`

### En Colab / máquina con los Excel

1. Carpeta con:
   - `VENTAS_KEYFOODS_ACTUAL.xlsx` (o nombre que detecte el script)
   - `MAESTRA_CLIENTES_ACTUAL.xlsx`
   - `Detalle_Stock_*.xlsx` o API stock
   - `LISTA DE PRECIOS *.xlsx`
   - `KEYFOODS_CONFIGURACION_MENSUAL_YYYY_MM.xlsx`
2. Secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (service_role, **no** la anon)
3. Correr:

```bash
python scripts/CICLO_UNICO.py
```

4. Log debe terminar en algo como `LISTO` / `cartera_terreno=...` / `stock=...`.

5. Re-verificar en SQL:

```sql
select count(*) from ventas_lineas;
select count(*) from cartera;
select count(*) filter (where coalesce(precio_unidad,0)>0) from stock;
-- Sur Capital debe tener detalle en gerencia_clientes.sku_detalle
select length(sku_detalle) from gerencia_clientes where cliente_key = '78444384-C';
```

---

## 4. Subir código a GitHub

En tu PC (Git Bash), carpeta del repo:

```bash
cd ~/Black-Sheep/Black-Sheep
```

1. Descomprimí este zip.
2. Copiá el contenido de `BLACKSHEEP\` **encima** del repo (reemplazando `apps`, `scripts`, `sql`, `brand`).
3. Commit:

```bash
git add -A
git status
git commit -m "Black Sheep limpio: canón SQL + ciclo único + app V7.9.1"
git push
```

---

## 5. Vercel

### App campo — `app.black-sheep.cl`
- Root Directory: `apps/field`
- Install: `npm install --legacy-peer-deps`
- Build: `npm run build`
- Output: `dist`
- Env: `VITE_SUPABASE_*`

### Web — `black-sheep.cl`
- Root Directory: `apps/web`
- Framework: Other (HTML estático)
- `dashboard.html` redirige a la app

Hard refresh en el celular → stamp **`v-BS-PLATFORM-V7.9.1-CSS`**.

---

## 6. Checklist “ya funciona”

| Check | Cómo |
|-------|------|
| Login / zona | Abrís app, ves NOR-ORIENTE etc. |
| Hoy | Aparecen clientes / NBA |
| Cartera | Lista clientes con venta |
| Stock | SKUs; si hay precio, pedido puede usarlo |
| Gerencia | Zonas + expandir mix (sku_detalle) |
| Pedido | Precio lista o histórico |
| Ciclo | `ventas_lineas` y `stock.precio_unidad` > 0 |

---

## 7. Problemas conocidos (dato, no código)

1. **Cliente con MTD pero 0 en `ventas_lineas`** → el ciclo agregó cartera pero no publicó líneas con esa `cliente_key`. Revisar Excel + `normalize_cliente_key` (ej. `78444384` vs `78444384-C`).
2. **Badge “1 SKU”** pero `sku_detalle` largo → el detalle está; el badge a veces cuenta mal (mejorar en front contando `parseSkuDetalle`).
3. **prom = 0 en sku_detalle** → % de ritmo raros; se corrige en el cálculo del ciclo.

---

## Estructura final del zip

```
BLACKSHEEP/
  apps/field/     # React app
  apps/web/       # Landing
  brand/
  scripts/
    CICLO_UNICO.py
    descargar_excel_drive.py
  sql/
    00_CANON_MINIMO.sql
  PASO_A_PASO.md
```
