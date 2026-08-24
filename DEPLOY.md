# Black Sheep — Deploy perfecto (V68 CLOSE)

Stamp esperado en app: **`v-BS-V68-CLOSE`**

Build verificado localmente: `npm run build` OK (sin errores JSX).

---

## 0. En tu PC (Windows)

```bat
cd /d %USERPROFILE%\Documents\Black-Sheep
```

1. Descomprimí el zip.
2. Copiá el contenido de `BLACKSHEEP\` **encima** del repo (reemplaza `apps/`, `scripts/`, `sql/`).
3. Commit y push:

```bat
git add -A
git status
git commit -m "V68 close: UX total + build limpio"
git push
```

Si el push da 504: esperá 1 minuto y `git push` de nuevo.

---

## 1. Vercel — App de campo (`app.black-sheep.cl`)

| Setting | Valor |
|---------|--------|
| Root Directory | `apps/field` |
| Install | `npm install --legacy-peer-deps --no-audit --no-fund` |
| Build | `npm run build` |
| Output | `dist` |
| Node | **24.x** |

Variables de entorno:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

Deploy → **sin caché** si falla raro (Redeploy → uncheck build cache).

Hard refresh en el teléfono. Debe verse el stamp **`v-BS-V68-CLOSE`**.

---

## 2. Vercel — Web (`black-sheep.cl`)

| Setting | Valor |
|---------|--------|
| Root Directory | `apps/web` |
| Framework | Other (estático) |

Dominios: `black-sheep.cl` y `www.black-sheep.cl`.

---

## 3. Supabase (por tenant / una vez)

SQL Editor — correr **en orden** si el tenant es nuevo:

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
sql/10_CATALOGO_WEB_V24.sql
sql/10b_STOCK_MEDIA_COLS.sql
sql/11_ORDER_INBOX_V26.sql
sql/13_ADMIN_PANEL.sql
sql/14_ADMIN_CONTROL.sql
sql/15_CICLO_PEDIDO_V29.sql
sql/16_CATALOGO_LISTA_FIRST.sql   ← lista primero, stock valida
```

Si el tenant ya existía: como mínimo **`16_CATALOGO_LISTA_FIRST.sql`**.

---

## 4. Ciclo de datos (mix + cartera + gerencia)

Archivo: `scripts/KEYFOODS_CICLO_UNICO.py` (versión **v1.34_MIX**)

Colab / Actions:
1. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
2. Excel: VENTAS, MAESTRA, STOCK, PRECIOS, CONFIG_MES
3. Recomendado sin Places si solo querés datos comerciales:

```python
import os
os.environ["KF_SKIP_PLACES"] = "1"
```

4. Debe terminar en `LISTO CICLO_UNICO...`
5. Sin ciclo nuevo, el **mix** en app puede seguir viejo (top 10).

---

## 5. Checklist de perfección (30 min en campo)

### App
- [ ] Stamp `v-BS-V68-CLOSE`
- [ ] Nav: **Hoy | Mapa | Clientes | Más** (Stock dentro de Más)
- [ ] Hoy: una tarjeta grande + máximo 3 “También hoy”
- [ ] Visita: pasos Llegada → Pedido → Cierre; CTA única
- [ ] Pedido: botón principal **Enviar a bodega**

### Datos
- [ ] Cliente con 3 SKU facturados → mix muestra 3 (Gerencia y ficha)
- [ ] Catálogo web del cliente: productos de lista; sin stock marcados, no invisibles
- [ ] Gerencia: solo clientes con venta al expandir zona
- [ ] Mapa: centra cerca del GPS (no el país entero)

### Si algo falla
| Síntoma | Qué hacer |
|---------|-----------|
| Build Vercel rojo | Root = `apps/field`, Node 24, sin caché |
| Stamp viejo | Hard refresh / borrar caché del navegador |
| Mix incompleto | Correr ciclo v1.34_MIX |
| Catálogo vacío/raro | SQL 16 + precios en tabla stock |
| Mapa error Google | `VITE_GOOGLE_MAPS_API_KEY` + APIs Maps habilitadas |
| Login no entra | URL/anon key del tenant correcto |

---

## Rollback

Si el deploy rompe campo: en Vercel → Deployments → promover el deployment anterior estable.  
El zip anterior de referencia: `BLACKSHEEP_COMPLETO_V67_FULL.zip`.
