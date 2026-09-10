# Black Sheep · App 2.0 — Fundación de datos

Base de datos de la plataforma multi-tenant. Es la Fase 1 del plan de
`ARQUITECTURA_2.0.md`: el modelo, la seguridad y las consultas que
alimentan las pantallas.

> **Estado:** 31 migraciones · corren limpias y son idempotentes ·
> 37 pruebas en verde · 8 controles de diagnóstico en OK ·
> dos apps que compilan. Verificado contra PostgreSQL 16.
>
> Estado detallado y qué sigue: `docs/PLAN.md`

---

## Qué resuelve

| | 15.3 | 2.0 |
|---|---|---|
| Aislamiento entre empresas | `tenant_id` TEXT, RLS parcial | RLS `ENABLE` + `FORCE` en todas las tablas |
| Superficie expuesta | todo en `public` | sólo el esquema `api` |
| Notas de crédito | suman positivo (~19% de más) | restan, por configuración |
| Elegibilidad de venta | `estado = Cerrado` (deja fuera 97,4%) | invertida y configurable |
| Cálculos | repartidos en las páginas | una sola definición, en SQL |
| Token de catálogo | texto plano, sin expiración | hash, expira, se revoca, con rate limit |
| Datos personales | mezclados con los de negocio | tabla aparte y permiso propio |
| Trazabilidad | ninguna | cada cifra apunta a su lote |
| Corte por impago | no existía | en la RLS: suspender apaga todo de golpe |
| Empresas que no miden por SKU | no soportado | capacidades por empresa |
| Corregir datos a mano | el archivo lo pisaba | procedencia por campo + conflictos |

---

## Estructura

```
apps/control-center/ consola de Black Sheep · admin.black-sheep.cl
apps/gerencia/     dashboard del cliente · <slug>.app.black-sheep.cl
apps/field/        PWA del vendedor · cola offline
db/INSTALAR.sql    las 31 migraciones en un archivo, para pegar en Supabase
db/migrations/     000–030 · en orden numérico, sin saltos
db/test/           shim + pruebas: seguridad (01), ciclo (02), dashboard (03)
contracts/         archivos.v3.json · el contrato de los 4 archivos
plantillas/        los 5 Excel que se le entregan al cliente
docs/              arquitectura, onboarding, pantallas y consolas
```

## Documentos

| Archivo | Para quién |
|---|---|
| `docs/ARQUITECTURA_2.0.md` | Interno · las decisiones y sus motivos |
| `docs/ENTREGA_CLIENTE.md` | **Para el cliente** · qué archivos pedir y por qué |
| `docs/CONSOLAS.md` | Dashboard de gerencia y consola de plataforma |
| `docs/CICLO_DE_CARGA.md` | Cómo el cliente actualiza sus datos solo |
| `docs/EDICION_DASHBOARD.md` | Corregir datos sin volver a subir archivos |
| `docs/RUNBOOK_SUPABASE.md` | Levantar la base, paso a paso, con verificación |
| `docs/SUBIR_A_GITHUB.md` | Cómo subir la 2.0 conservando la V15.3 |
| `docs/EVALUACION_ARQUITECTURA.md` | Qué se adopta de la propuesta de adapters y qué no |
| `docs/SUPERFICIES.md` | Las cuatro superficies, sus dominios y quién entra a cada una |
| `docs/PLANES.md` | Cómo se empaqueta lo que se vende |
| `docs/PLAN.md` | Qué está listo, cuándo cargar data y qué sigue |
| `docs/PRECIO_CLIENTE.md` | Acordado, histórico y lista: qué paga cada cliente |
| `docs/AUDITORIA_SEGURIDAD.md` | Qué se revisó, qué falta y qué sí se puede proteger |
| `docs/PANTALLAS.md` | Qué lee cada pantalla de la app |
| `docs/ONBOARDING_TENANT.md` | Alta de una empresa, paso a paso |

## Verificación automática

Cada push corre `.github/workflows/verificar.yml`: las 31 migraciones
dos veces (idempotencia), las 5 suites de pruebas, el diagnóstico de
seguridad, el guard y el build de las tres apps, y un detector de
credenciales. Si algo se pone rojo, no se despliega.

## Correr en local

```bash
createdb bs2
psql -d bs2 -f db/test/00_shim_supabase.sql        # sólo local
for f in db/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d bs2 -f "$f"; done
psql -d bs2 -f db/test/01_smoke.sql                # 9 pruebas
psql -d bs2 -c 'select * from compliance.diagnostico();'
```

En Supabase: pegar los archivos en el SQL Editor en orden, **sin** el shim.

---

## Los cuatro esquemas

| Esquema | Contenido | Expuesto |
|---|---|---|
| `platform` | tenants, usuarios, membresías, roles, auditoría | no |
| `core` | clientes, productos, precios, stock, ventas, terreno | no |
| `ingest` | archivos, lotes, filas crudas, exclusiones, linaje | no |
| `compliance` | privacidad, incidentes, retención, controles | no |
| `api` | vistas y funciones que consume la app | **sí, sólo este** |

Una tabla nueva en `core` **no** queda publicada por accidente. Para
exponerla hay que agregarla a `api` a mano, y eso es una decisión visible
en el diff.

---

## Reglas del proyecto

Las cinco de la 15.3 más tres nuevas. Todas salieron de bugs reales.

1. Una sola rama.
2. Nada se sube sin `verify` verde.
3. Ninguna consulta falla en silencio.
4. Colores de marca en hex literal, nunca `var()`.
5. Una función SQL, un solo archivo.
6. **Ninguna tabla sin política RLS.**
7. **Ningún `select('*')` en producción.**
8. **Ningún secreto en el repositorio.**

Las tres últimas las verifica `compliance.diagnostico()` y el guard.

---

## Lo que falta

1. **Configurar el hook de token en Supabase** (Auth → Hooks) y sembrar el primer superadmin
2. **Paneles de integridad en el Resumen** — `api.integridad` ya los entrega
3. **Storage del archivo original** — hoy se guarda el hash y las filas, no el binario
4. **Service worker** para que la app de terreno abra sin red la primera vez
