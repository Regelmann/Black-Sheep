# DEPLOY — paso a paso

**Versión:** `v-BS-PLATFORM-V10.4`

Este documento se actualiza **en cada entrega**. Si una versión trae SQL nuevo,
aparece en la sección 2.

---

## Resumen

| Paso | Qué | Cuánto |
|---|---|---|
| 0 | Verificar estado actual | 1 min |
| 1 | Backup | 2 min |
| 2 | SQL en Supabase | 5 min |
| 3 | Subir código a GitHub | 3 min |
| 4 | Verificar deploy en Vercel | 2 min |
| 5 | Prueba de humo | 5 min |

**Orden obligatorio: SQL antes que código.** Si sale primero el código, la app
llama funciones que todavía no existen.

---

## Paso 0 · Ver qué tenés

Supabase → **SQL Editor** → pegar `sql/00_VERIFICAR_ESTADO.sql` → Run.

Devuelve 9 bloques. Anotá los `❌`: eso es lo que hay que arreglar.

No modifica nada. Se puede correr cuantas veces quieras.

---

## Paso 1 · Backup

Supabase → **Database → Backups** → *Create backup*.

En el plan gratuito no hay backups automáticos. Si algo sale mal en el paso 2,
esto es lo único que te salva.

Alternativa local:

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner \
  -f backup_$(date +%Y%m%d_%H%M).sql
```

---

## Paso 2 · SQL

Supabase → **SQL Editor**. Un archivo por vez, **en orden**, esperando que cada
uno termine antes del siguiente.

### 2.1 · Base nueva (o el paso 0 mostró tablas faltantes)

```
01_COMMERCE_CANON.sql
02_RIESGO_FUGA.sql
03_PEDIDOS_HISTORIAL.sql
04_ORDER_BRIDGE.sql
06_ENCUESTAS_VISITA.sql
07_STOCK_PRECIOS.sql
08_PROSPECTOS_RLS.sql
09_ES_NUEVO_MES.sql
10b_STOCK_MEDIA_COLS.sql
11_ORDER_INBOX_V26.sql
13_ADMIN_PANEL.sql
14_ADMIN_CONTROL.sql
15_CICLO_PEDIDO_V29.sql
17_MEMORY_DECISIONS.sql
19_CATALOGO_OFERTA_CLIENTE.sql
20_CATALOGO_CANONICO.sql        ← catálogo público
21_PEDIDO_PUBLICO_CANONICO.sql  ← pedido del cliente
22_HOTFIX_V931.sql
23_DATA_ISOLATION_CATALOGO.sql
25_CATALOGO_FINAL.sql           ← sanea esquema + elimina sobrecargas
26_CATALOGO_ORDEN.sql           ← orden: compra → sugerido → resto
27_IDEMPOTENCIA.sql             ← evita duplicados al reintentar la cola
28_RLS_ESTRICTO.sql             ← aislamiento por ejecutivo y tenant
```

Los saltos (05, 10, 12, 16, 18) son a propósito: esos archivos se eliminaron por
obsoletos. Ver `sql/README.md`.

### 2.2 · Si ya tenías V9.1 o anterior corriendo

Sólo faltan estos dos:

```
20_CATALOGO_CANONICO.sql
21_PEDIDO_PUBLICO_CANONICO.sql
```

**Qué arreglan:**

`20` — La tabla `ofertas_cliente` tiene la columna `activo`, pero una versión
vieja de `get_public_catalogo()` consultaba `activa`. Postgres respondía
`column does not exist`, la función abortaba, y el cliente veía **"Link
inválido"** aunque el link fuera correcto.

`21` — `crear_pedido_publico()` estaba definida con **dos firmas** distintas
(2 y 3 argumentos). En Postgres son funciones **distintas**: `create or replace`
sólo pisa la de firma idéntica, así que ambas quedaban vivas. Como la de 3 args
tiene `DEFAULT`, llamar con 2 matchea ambas:

```
ERROR: function reference "crear_pedido_publico" is not unique
```

**El cliente armaba el pedido, apretaba enviar, y fallaba.**

### 2.3 · Verificar

Los dos archivos traen bloque de verificación al final.

**`21` debe devolver EXACTAMENTE una fila.** Si devuelve dos o más, la
ambigüedad sigue: volvé a correrlo entero, incluido el bloque `DO $$` que
elimina las sobrecargas.

Después correr `00_VERIFICAR_ESTADO.sql` de nuevo. Todo debe decir `✅`, salvo
los `⚠️` del bloque 7 (políticas abiertas — deuda conocida, Fase 1.3).

### 2.4 · Re-ejecución

Todos los archivos son idempotentes: `IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
`CREATE OR REPLACE`. Correrlos dos veces no rompe nada.

---

## Paso 3 · Código

```bash
cd ~/Downloads
rm -rf _bs_tmp && mkdir _bs_tmp
unzip -q BLACKSHEEP_V93.zip -d _bs_tmp

rsync -av --delete \
  --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  _bs_tmp/ ~/Black-Sheep/Black-Sheep/

cd ~/Black-Sheep/Black-Sheep/apps/field
npm ci
npm run verify          # guard + tests + build. Si falla, NO subir.
cd ../..

git add -A
git status --short | grep '^D' | head -30    # revisar los borrados
git commit -m "V9.3"
git push

cd ~/Downloads && rm -rf _bs_tmp
```

`--delete` borra del repo los archivos que ya no existen. Sin eso quedan
archivos viejos. Por eso el `git status` antes del commit: mirá la lista de
borrados antes de confirmar.

---

## Paso 4 · Vercel

Vercel despliega solo al recibir el push. Verificar:

1. **Deployments** → el último debe decir *Ready*
2. Abrir `app.black-sheep.cl` → el stamp abajo debe decir **`v-BS-PLATFORM-V10.4`**

**Si el stamp no cambió:** hay un rollback activo. Deployments → buscar el
deploy correcto → menú `⋯` → **Promote to Production**.

Si sigue igual en el teléfono, es la PWA cacheada: cerrar la app por completo y
volver a abrir.

---

## Paso 5 · Prueba de humo

En este orden. Cada punto verifica algo que se rompió alguna vez.

| # | Qué probar | Debe pasar | Si falla |
|---|---|---|---|
| 1 | Login | Botones **naranjas**, no grises | Volvió el `var()` circular en `tenants.js` |
| 2 | Clientes | El título "Mi cartera" se **lee** | Volvió el texto negro sobre fondo negro |
| 3 | Clientes → un cliente | Se ven los 4 botones: Llamar · WhatsApp · Navegar · Nota | `flex-wrap` en vez de grid |
| 4 | Stock → "Encontrar compradores" | Muestra clientes, o **dice que falló**. Nunca "0 clientes" en silencio | Falta migrar a `safeSelect` |
| 5 | Hoy | Aparece **"Focos del mes"** con barras | `FocosMes` no cableado |
| 6 | Catálogo → copiar link → abrir en incógnito | Carga el catálogo | Falta `20_CATALOGO_CANONICO.sql` |
| 7 | Catálogo → armar pedido → enviar | Devuelve **número de pedido** | Falta `21`, o volvió la ambigüedad |
| 8 | Gerencia | Números, o banner nombrando qué bloque falló | `Promise.all` en vez de `allSettled` |
| 9 | **Modo avión** → check-in → nota → volver a red | Las filas aparecen en Supabase | Ver abajo |

### El punto 9 es el más importante

Es el único que decide si un vendedor confía en la app.

```
1. Modo avión
2. Abrir una visita → Check-in
3. Escribir una nota
4. Cerrar la app por completo
5. Quitar modo avión
6. Reabrir la app, esperar ~10 segundos
7. En Supabase:
     select * from checkins      order by creado_en desc limit 5;
     select * from notas_cliente order by creado_en desc limit 5;
```

**Las dos filas tienen que estar.** Si falta alguna, avisá con lo que diga la
consola — hasta V9.2 había un bug donde un fallo de sincronización **borraba**
el item de la cola como si se hubiera subido.

---

## Rollback

**Código:** Vercel → Deployments → el anterior → *Promote to Production*.

**SQL:** `20` y `21` son `CREATE OR REPLACE`; no borran datos. Si hay que volver
atrás, restaurar el backup del paso 1.

`21` **sí elimina** las sobrecargas viejas de `crear_pedido_publico()`. Eso es
intencional — eran el bug. La definición vieja queda en el historial de git de
`01_COMMERCE_CANON.sql`.

---

## ETL

El SQL crea el esquema; **el ETL llena los datos.**

`scripts/KEYFOODS_CICLO_UNICO.py` alimenta `cartera`, `ejecutivos`,
`ventas_lineas`, `gerencia`, `snapshot_meta`, `stock`.

Hoy corre a mano en Google Colab:

```python
!pip install supabase
# Secrets de Colab: SUPABASE_SERVICE_KEY
# Ejecutar el notebook completo
```

**Compuerta VALIDAR/PUBLICAR:** ninguna bajada llega a producción sin pasar los
chequeos de integridad. No saltearla.

Si el paso 0 mostró `⚠️ datos viejos`, corré el ciclo antes de probar la app: vas
a estar mirando números de hace días.

Automatizarlo requiere estos secrets en GitHub Actions:

```
SUPABASE_URL · SUPABASE_SERVICE_KEY · GOOGLE_MAPS_API_KEY
GDRIVE_SA_JSON · GDRIVE_FOLDER_ID
```

---

## Checklist

```
[ ] 0 · 00_VERIFICAR_ESTADO.sql — anotados los ❌
[ ] 1 · Backup hecho
[ ] 2 · SQL corrido en orden
[ ] 2 · Verificación de 21 → EXACTAMENTE una fila
[ ] 2 · 00_VERIFICAR_ESTADO.sql de nuevo → sin ❌
[ ] 3 · npm run verify → verde
[ ] 3 · git push
[ ] 4 · Stamp en pantalla dice v-BS-PLATFORM-V10.4
[ ] 5 · Puntos 1-8 de la prueba de humo
[ ] 5 · Punto 9 — modo avión (el que importa)
```
