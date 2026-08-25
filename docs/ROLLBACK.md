# Rollback — Black Sheep (V2.6 Inbox / Catálogo / Ciclo)

Usá este documento si un deploy o SQL deja la app o el catálogo en mal estado.
Orden recomendado: **app primero** (rápido) → **SQL solo si el fallo es de datos/RPC**.

---

## 1. Rollback de la app (Vercel / Git) — 2 minutos

### Opción A — Vercel Dashboard (más simple)

1. Entrá a [vercel.com](https://vercel.com) → proyecto **field** (`app.black-sheep.cl` o el que uses).
2. **Deployments**.
3. Buscá el deployment **anterior** que funcionaba (stamp distinto a `v-BS-PLATFORM-V2.6-INBOX`).
4. ⋯ → **Promote to Production**.
5. Hard refresh en el celular (`Ctrl+Shift+R` / borrar caché del sitio).

Repetí lo mismo en el proyecto **web** (`black-sheep.cl`) si también lo tocaste.

### Opción B — Git

```bash
cd ~/Black-Sheep   # o la ruta de tu repo

# ver últimos commits
git log --oneline -15

# volver el código al commit bueno (ejemplo)
git revert HEAD --no-edit
# o reset solo si nadie más pusheó:
# git reset --hard <commit_sha_bueno>
# git push --force-with-lease

git push
```

Vercel redeploya solo. Verificá el stamp abajo a la derecha en la app.

| Stamp problemático | Acción |
|--------------------|--------|
| `v-BS-PLATFORM-V2.6-INBOX` | Promote deployment anterior |
| `v-BS-PLATFORM-V2.5-SHOP` | Solo catálogo; rollback si el shop rompe el build |

---

## 2. Rollback de SQL (Supabase)

Los scripts V2.6 son en su mayoría `CREATE OR REPLACE` e `ADD COLUMN IF NOT EXISTS`.
**No borran tablas ni datos de ventas.** Las columnas nuevas se pueden dejar (son inofensivas).

### 2.1 Si falló `get_public_catalogo` (catálogo vacío / error RPC)

Restaurá la versión anterior del catálogo:

```sql
-- Ejecutar en SQL Editor el contenido de:
-- sql/05_CATALOGO_PUBLICO.sql
```

Eso reemplaza `get_public_catalogo` por la definición V56.14 previa al V2.4/V2.5.

Si no tenés el archivo a mano, en el monorepo:

`BLACKSHEEP/sql/05_CATALOGO_PUBLICO.sql`

### 2.2 Si falló `crear_pedido_publico` (no se puede pedir desde la web)

```sql
-- Restaurar desde commerce canónico:
-- sql/01_COMMERCE_CANON.sql
-- (solo la función crear_pedido_publico, o el archivo completo si es idempotente)
```

O volvé a correr el bloque `crear_pedido_publico` de `01_COMMERCE_CANON.sql`.

### 2.3 Columnas nuevas (`imagen_url`, `token_catalogo`, etc.)

**No hace falta revertirlas.** No rompen lecturas antiguas.

Si igual querés limpiar (opcional, no recomendado en producción):

```sql
-- SOLO si estás seguro y en un entorno de prueba
-- alter table public.stock drop column if exists imagen_url;
-- alter table public.pedidos drop column if exists token_catalogo;
```

### 2.4 Pedidos mal creados por una prueba

```sql
-- Anular pedidos de prueba del catálogo (no borra histórico real)
update public.pedidos
set estado = 'cancelado'
where fuente = 'catalogo_publico'
  and creado_en > now() - interval '2 hours'
  and coalesce(nota, '') ilike '%prueba%';
```

---

## 3. Rollback del ciclo Python (Colab / Actions)

| Situación | Qué hacer |
|-----------|-----------|
| Ciclo publicó números malos | **No re-subir Excel completo** sin anti-dupe. Usá `KF_FORCE_VENTAS=1` solo si entendés el impacto. |
| Actions dejó datos corruptos | Desactivá el workflow: GitHub → Actions → `ciclo-diario.yml` → Disable. Corré el ciclo a mano con Excel bueno. |
| Querés volver al script anterior | En el repo: `scripts/KEYFOODS_CICLO_UNICO.py` → restaurar del commit anterior (`git checkout <sha> -- scripts/KEYFOODS_CICLO_UNICO.py`). |

Snapshot de seguridad antes de un ciclo riesgoso:

```sql
-- Anotá el MTD publicado antes de correr
select * from snapshot_meta order by fecha_snapshot desc limit 3;
select ejecutivo, venta_mtd from gerencia;
```

---

## 4. Checklist post-rollback

- [ ] App carga (login OK)
- [ ] Stamp es el de la versión estable
- [ ] Hoy muestra cartera / action queue
- [ ] Catálogo con token de prueba responde (o error claro, no 500)
- [ ] `select count(*) from pedidos where creado_en::date = current_date` coherente
- [ ] Gerencia abre sin pantalla en blanco

---

## 5. Orden de emergencia (resumen)

```
1. Vercel → Promote deployment anterior          (app rota)
2. sql/05_CATALOGO_PUBLICO.sql                  (catálogo roto)
3. sql/01_COMMERCE_CANON.sql → crear_pedido_*   (pedido web roto)
4. Cancelar pedidos de prueba                   (datos de test)
5. Disable GitHub Action ciclo-diario           (datos diarios mal)
```

---

## 6. Contacto / evidencias

Guardá antes de pedir ayuda:

- Stamp de la app
- URL del deployment de Vercel
- Mensaje de error de Supabase (RPC)
- Hora aproximada del deploy

Archivos de este paquete relacionados:

| Archivo | Uso |
|---------|-----|
| `docs/CICLO_PEDIDOS_V26.md` | Flujo feliz inbox |
| `docs/ROLLBACK.md` | Este documento |
| `sql/05_CATALOGO_PUBLICO.sql` | Rollback catálogo |
| `sql/01_COMMERCE_CANON.sql` | Rollback commerce / pedido |
| `sql/11_ORDER_INBOX_V26.sql` | Forward only (inbox) |
