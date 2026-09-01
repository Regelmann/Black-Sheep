# Black Sheep

**Versión vigente: `v-BS-PLATFORM-V13.2`**
PWA comercial de ventas en terreno + analítica operacional + catálogo/pedidos, multi-tenant y offline-first.

## Estado de esta entrega

- **Ventas integral:** histórico + `Nuevas ventas.xlsx` en un único Ciclo Único.
- **Modelo operacional:** Pedido → Factura → NC → Venta neta.
- **Analítica:** resumen mensual, pedidos, pendientes, clientes, productos, vendedores, Fill Rate y calidad de conciliación.
- **App:** `/ventas` integrada para gerencia.
- **Catálogo:** conserva la lógica de stock visible y bloqueo de compra cuando corresponde.
- **Web:** landing/control center y navegación coherentes con la plataforma.
- **Deploy:** GitHub → CI → Vercel, con `BUILD_STAMP` único.
- **V13.2 — RLS multi-tenant cerrado:** `sql/47_RLS_CIERRE_FINAL.sql` reemplaza cualquier `USING(true)` residual.
- **V13.2 — `updated_at`:** `sql/48_AUDITORIA_TIMESTAMPS.sql` agrega auditoría de escrituras concurrentes.
- **V13.2 — offline-first:** cola y snapshot de cartera en IndexedDB con migración desde localStorage.
- **V13.2 — Data Health visible:** semáforo en Gerencia y Dashboard antes de mostrar números.
- **V13.2 — idempotencia completa:** `nota`, `pedido` y `no_venta` mandan `client_op_id` y tratan `23505` como éxito.

> Esta repo es la fuente única de verdad. No se versionan ZIPs, builds, `node_modules`, `.env`, `__pycache__` ni copias de scripts por versión. El historial técnico vive en `docs/historial/`.

## Arquitectura

```text
apps/field/        PWA móvil del ejecutivo (React + Vite)
apps/web/          Web/landing/control center (Next.js)
scripts/            ETL canónico; un solo Ciclo Único
sql/                migraciones y vistas Supabase
docs/               operación, seguridad, arquitectura y ventas
brand/              activos de marca
```

## Ciclo Único

El único ETL vigente es `scripts/CICLO_UNICO.py` (V1.38). Acepta el histórico y el archivo operativo nuevo dentro de una misma corrida.

Reglas de datos:

1. **Pedido no es venta.** Alimenta operación y Fill Rate.
2. **Factura es venta positiva.**
3. **NC es ajuste negativo.**
4. **Venta neta real = Factura − NC.**
5. **Fill Rate = Kg facturados / Kg pedidos.**
6. La maestra asigna el cliente/zona; no se usa el vendedor del ERP para reasignar cartera.
7. La conciliación automática de clientes usa coincidencia exacta de RUT; no se escribe matching difuso en producción.

### Fuentes

- `VENTAS_KEYFOODS_ACTUAL.xlsx` — histórico.
- `Nuevas ventas.xlsx` — Pedido/Factura/NC y atributos operacionales.
- Maestra de clientes.
- Stock.
- Lista de precios.
- Configuración mensual y media de productos, cuando corresponda.

## Supabase

La capa de ventas nueva se instala con:

1. `sql/44_VENTAS_INTEGRACION_TOTAL.sql` — tablas/índices de operación.
2. `sql/46_VENTAS_REPORTES_APP.sql` — vistas consumidas por la app.
3. `sql/47_RLS_CIERRE_FINAL.sql` — cierre total de RLS multi-tenant.
4. `sql/48_AUDITORIA_TIMESTAMPS.sql` — `updated_at` en tablas editables.

`sql/45_VENTAS_TOTAL_ANALITICA.sql` quedó superseded y ya no forma parte del deploy.

## App de Ventas

`Más → Ventas` expone:

- Resumen
- Pedidos
- Pendientes
- Clientes
- Productos
- Vendedores
- Calidad

La UI está diseñada como superficie de decisión: estado → cambio → acción, con progressive disclosure, tablas de drill-down, estados de carga/error/vacío y layout responsive.

## UX/UI: criterio de producto

La plataforma no busca ser un museo de métricas. Cada vista debe responder rápido:

1. ¿Cómo estamos?
2. ¿Qué cambió?
3. ¿Qué debo hacer?

Los dashboards por rol son preferibles a una pantalla universal; el estándar actual de B2B SaaS prioriza time-to-value, jerarquía de información, filtros, comparaciones y acciones contextualizadas.

## Desarrollo

```bash
cd apps/field
npm ci
cp .env.example .env
npm run verify
```

`npm run verify` ejecuta lint, typecheck, guard, tests y build. CI usa Node 24.

Para Web:

```bash
cd apps/web
npm ci
npm run lint
npm run typecheck
npm run build
```

## Deploy seguro

Usar `scripts/DEPLOY_VENTAS_V13_1.sh`. El flujo recomendado es:

```text
ZIP limpio
  ↓
validar estructura
  ↓
rsync --dry-run
  ↓
rsync real
  ↓
npm ci + verify
  ↓
revisión de deletes/diff
  ↓
commit
  ↓
push
  ↓
CI
  ↓
Vercel
```

Nunca se hace `git push` si `verify` falla.

## Documentación vigente

- `DEPLOY.md` — procedimiento de despliegue (incluye 47 y 48).
- `ARQUITECTURA.md` — arquitectura.
- `SEGURIDAD.md` — RLS/seguridad.
- `RENDIMIENTO.md` — rendimiento y bundle.
- `ROADMAP.md` — siguientes fases.
- `INTEGRACION_V13_1.md` — integración de ventas.
- `docs/ventas/DEPLOY_V13_1.md` — instalación de la capa de ventas.
- `docs/PRODUCTO_COMERCIAL.md` — posicionamiento, replicabilidad y estrategia de precio.
- `docs/historial/` — versiones y auditorías históricas.

## Release gate

Antes de declarar una versión vendible:

- [ ] SQL aplicado y verificado en Supabase.
- [ ] Colab probado con datos reales en modo sin escritura.
- [ ] `npm run verify` verde.
- [ ] Web lint/typecheck/build verde.
- [ ] CI verde.
- [ ] Smoke test móvil real, incluyendo modo avión/offline.
- [ ] Revisión visual de `/`, `/ventas`, catálogo, pedido y navegación.
- [ ] README y `VERSION` actualizados.
- [ ] BUILD_STAMP visible en producción.

## Producto comercializable

Black Sheep debe venderse como **plataforma vertical de ejecución comercial y decisiones**, no como “otro dashboard”. El activo diferencial es la combinación de:

`datos ERP → normalización → ciclo de recompra → stock/precio → operación pedido/factura/NC → acción comercial`.

La arquitectura multi-tenant permite replicar la plataforma a otros distribuidores, pero cada nuevo cliente requiere un adaptador de datos, mapeo de maestros, reglas de negocio y validación de RLS antes de declararlo productivo.
