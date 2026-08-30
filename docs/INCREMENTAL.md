# El incremental — por qué no funciona y cómo cerrarlo

## Primero: el ciclo SÍ tiene la lógica

Lo verifiqué línea por línea. Línea 11 del propio archivo:

```
#   - Excel nuevo se SUMA a public.ventas_lineas (no reemplaza el mes)
```

Y en la línea 3492:

```python
hist_desde = date(mes_trabajo.year, mes_trabajo.month, 1)
for _ in range(6):
    hist_desde = (hist_desde - timedelta(days=1)).replace(day=1)   # 6 meses atrás

hist = fetch_ventas_supabase(sb, hist_desde, hist_hasta)
```

**El ciclo lee 6 meses de histórico desde Supabase y lo fusiona con el Excel.**
No necesita que le lleves el histórico completo en el archivo. Eso ya está
resuelto.

Así que cuando decís "si cargo solo el día de hoy no me calcula nada", **no es
que falte la funcionalidad: es que algo la está bloqueando.**

---

## Las tres razones por las que puede fallar

### 1 · `ventas_lineas` está vacía o incompleta

El incremental fusiona Excel + Supabase. Si en Supabase no hay histórico, la
fusión da solo el Excel — y ahí sí "no calcula nada".

**Verificalo:**

```sql
SELECT
  to_char(fecha, 'YYYY-MM')       AS mes,
  COUNT(*)                        AS lineas,
  COUNT(DISTINCT cliente_key)     AS clientes,
  SUM(venta_neta_clp)             AS venta
FROM public.ventas_lineas
GROUP BY 1
ORDER BY 1 DESC
LIMIT 8;
```

Si esto devuelve pocas filas o pocos meses, **ese es el problema**. El
incremental no tiene de dónde sacar el histórico.

**Solución:** una vez, correr el ciclo con el Excel completo del mes y

```python
os.environ["KF_VENTAS_FULL_REPLACE"] = "1"
os.environ["KF_FORCE_VENTAS"] = "1"
```

Eso siembra `ventas_lineas`. **Desde ahí en adelante, el incremental funciona
con el Excel del día.**

### 2 · Una validación aborta el ciclo en silencio

Línea 3384 — el ciclo se **detiene** si:

```python
if mtd_prev_pub > 0 and mtd_merged < mtd_prev_pub * 0.75:
    errors.append("MTD merge < 75% de publicado")
```

Traducido: si lo que va a publicar es **menos del 75%** de lo que ya estaba
publicado, aborta. Es una protección correcta —evita borrar el mes con un
Excel parcial— pero **si `ventas_lineas` está vacía, el merge da solo el día
de hoy, cae muy por debajo del 75%, y el ciclo se planta.**

Y la línea 3389, la contraria:

```python
if mtd_prev_pub > 100_000 and mtd_merged > mtd_prev_pub * 1.35:
    errors.append("probable doble conteo en ventas_lineas")
```

Si cargaste el mismo Excel dos veces, `ventas_lineas` quedó inflada y el ciclo
también aborta.

**Verificá si hay doble conteo:**

```sql
SELECT cliente_key, sku_canon, fecha, COUNT(*) AS veces
FROM public.ventas_lineas
GROUP BY 1,2,3
HAVING COUNT(*) > 1
ORDER BY veces DESC
LIMIT 20;
```

Si aparecen filas, hay doble conteo. Se limpia así:

```sql
DELETE FROM public.ventas_lineas a
USING public.ventas_lineas b
WHERE a.ctid < b.ctid
  AND a.cliente_key = b.cliente_key
  AND a.sku_canon   = b.sku_canon
  AND a.fecha       = b.fecha
  AND COALESCE(a.venta_neta_clp,0) = COALESCE(b.venta_neta_clp,0);
```

### 3 · El promedio se calcula sobre el mes anterior, no sobre `ventas_lineas`

Línea 1425:

```python
prev = gs[gs["fecha_d"] < mes_inicio]
if prev.empty:
    prom = cant_mtd if cant_mtd > 0 else 0.0   # cliente "nuevo"
```

`gs` es el DataFrame **fusionado**. Si la fusión trajo el histórico, `prev`
tiene datos y el promedio sale bien. Si no, **todos los clientes aparecen como
nuevos sin historial** — que es exactamente el síntoma que describís.

---

## El diagnóstico en un comando

Antes de correr el ciclo, mirá la salida. El ciclo **ya imprime** lo que
necesitás:

```
histórico Supabase ventas_lineas: N filas (2026-02-01→2026-08-30)
```

- **Si N es 0 o muy bajo** → causa 1: `ventas_lineas` sin sembrar
- **Si aborta con "MTD merge < 75%"** → causa 2: la protección se disparó
- **Si aborta con "doble conteo"** → causa 2: hay filas duplicadas

Esa línea te dice cuál de los tres es, sin adivinar.

---

## El cierre de verdad: que corra solo

Todo esto existe porque el ciclo se corre a mano y a veces con archivos
parciales. **La solución de fondo es que corra solo todos los días.**

El workflow de GitHub Actions ya está escrito. Faltan cinco secretos:

| Secreto | De dónde sale |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` |
| `GDRIVE_SA_JSON` | Google Cloud → service account → clave JSON |
| `GDRIVE_FOLDER_ID` | el ID de la carpeta de Drive con los 4 Excel |
| `GOOGLE_MAPS_API_KEY` | la que ya usás |

Se cargan en **GitHub → Settings → Secrets and variables → Actions → New
repository secret**.

Con eso: dejás los Excel en Drive y el ciclo corre solo. Nunca más un Excel
parcial rompiendo el mes, y el incremental deja de depender de que alguien se
acuerde de subir el archivo completo.

Lo único que lleva tiempo es la service account de Google — media hora, una
sola vez.
