# Black Sheep — Arquitectura App 2.0

**Estado:** propuesta cerrada, pendiente de aprobación
**Fecha:** 6 de septiembre de 2026
**Reemplaza a:** `docs/architecture/ARQUITECTURA_V15.md`, `ARQUITECTURA.md`, `SEGURIDAD.md`
**Absorbe a:** `docs/ARQUITECTURA_2.0_LEGAL_SECURITY.md` (paquete legal V1), `contracts/archivos.v2.json`

---

## 0 · Qué es este documento y cómo se usa

Este es el **contrato de arquitectura**. No es una descripción de lo que existe: es la definición de lo que se va a construir.

Tres reglas de uso:

1. **Nada se implementa si no está acá.** Si aparece una necesidad nueva, se agrega a este documento primero y después se escribe el código.
2. **Si el código y este documento se contradicen, gana el documento** y el código es un bug.
3. **Cada decisión lleva su motivo.** Casi todas salieron de un bug real de la 15.x. Sin el motivo, la próxima persona la revierte.

### De dónde sale

Todo lo que sigue está construido sobre material que ya existe y fue verificado, no sobre teoría:

- `BLACKSHEEP_V153.zip` — el producto funcionando hoy
- `BLACKSHEEP_APP2_LEGAL_SECURITY_BASE_V1.zip` — el add-on de privacidad y seguridad
- El contrato de 4 archivos (`contracts/archivos.v2.json`)
- Los hallazgos de integridad de datos medidos contra la base real de KeyFoods
- Ley 21.719, con vigencia plena el 1 de diciembre de 2026

---

## 1 · Restricciones que mandan sobre el diseño

| # | Restricción | Consecuencia arquitectónica |
|---|---|---|
| R1 | KeyFoods opera hoy sobre V15.3 (como apoyo, no como sistema de registro) | La 2.0 se construye **al lado**, no encima. Nunca hay una ventana donde no exista un sistema usable |
| R2 | Feria en Espacio Riesco, 29-sep a 1-oct (23 días) | La demo corre sobre **V15.3 congelada**. La 2.0 no tiene que estar lista para la feria |
| R3 | Ley 21.719 con vigencia plena el 1-dic-2026 (86 días) | La 2.0 **nace bajo la ley nueva**. No hay período de gracia técnico |
| R4 | Se vende a otras distribuidoras | Aislamiento entre empresas es un requisito de seguridad, no una comodidad |
| R5 | Onboarding sin tocar código: 4 archivos, 13 columnas mínimas | La configuración por empresa vive en datos, nunca en constantes del build |
| R6 | Los ejecutivos trabajan en la calle, con señal intermitente | Escritura offline con cola idempotente es parte del núcleo, no un extra |

**Sobre R2 y R3 juntas.** Es la observación más importante del documento: la 2.0 va a entrar en producción muy cerca de la fecha en que la ley se vuelve exigible y fiscalizable. Diseñarla ahora bajo el estándar de la 21.719 no cuesta prácticamente nada. Adaptarla después, con datos de varias empresas adentro, cuesta una migración completa. Es la ventana buena y dura tres meses.

---

## 2 · Diagnóstico de la 15.3 — qué se conserva y qué no

Medido sobre el código real, no estimado.

| Medición | Valor | Lectura |
|---|---|---|
| Líneas JS/JSX en `apps/field` | 25.492 | Producto maduro, no prototipo |
| Archivos de test | 51 | Cobertura real, se conserva |
| Archivos SQL | 51 | Numeración con colisiones y redefiniciones |
| Hojas de estilo | 11 (~7.900 líneas) | La deuda más visible |
| `!important` | **154**, de los cuales **128 en `v90-fixes.css`** | Una sola hoja de parches pisa a todas las demás |
| `select('*')` en producción | **37** en 15 archivos | Viola el principio de columnas explícitas |
| Token de catálogo | **texto plano** en `ofertas_cliente.token` | Credencial almacenada sin hash |
| `tenants.id` | **TEXT** (`'keyfoods'`) | Incompatible con el paquete legal, que asume UUID |

### Lo que se conserva (es bueno y costó caro)

- **`safeSelect`** — ninguna consulta falla en silencio. Es el mejor patrón del código actual.
- **`useDatos`** — el puente entre `safeSelect` y TanStack Query. Resuelve un choque de contratos real (una consulta fallida se cacheaba como éxito). Se conserva textual.
- **La cola offline** (`outboxDb`, `syncHandlers`) con handlers como fuente única.
- **El guard** (`scripts/guard.js`) y sus 10 reglas. Se amplía, no se reemplaza.
- **El contrato de 4 archivos.** Es el activo comercial del producto: es lo que permite vender a otra distribuidora sin tocar código.
- **La lógica de negocio**: `planDia`, `decisionEngine`, `riesgo`, `precios`, `habiles`, `dondeIr`. Se porta con sus tests.

### Lo que no pasa a la 2.0

- Las 11 hojas de estilo. Una sola, con tokens, y `!important` prohibido salvo lista blanca documentada.
- Los 37 `select('*')`.
- La numeración SQL actual, con funciones redefinidas en varios archivos.
- El token de catálogo en texto plano.
- `tenants.id` como TEXT.
- Los cálculos de negocio hechos en el cliente sobre tablas crudas.

---

## 3 · Decisiones de arquitectura

Cada decisión: contexto, decisión, qué se gana, qué se paga.

### D-01 · Base nueva, migración por estrangulamiento

**Contexto.** V15.3 funciona. Reescribir todo de una vez y cortar el cordón es el escenario donde se llega sin nada.
**Decisión.** Proyecto Supabase **nuevo** para la 2.0. La 15.3 se congela y sigue viva hasta que cada pantalla de la 2.0 la reemplace, una por una.
**Se gana.** Nunca hay un día sin sistema. La 2.0 se valida contra la 15.3 corriendo en paralelo.
**Se paga.** Dos bases durante la transición. Se acota con una regla dura: **la 15.3 no recibe features nuevas, sólo hotfix de producción.**

### D-02 · `tenant_id` UUID, con `slug` legible aparte

**Contexto.** Hoy `tenants.id` es TEXT (`'keyfoods'`). El paquete legal declara `tenant_id UUID REFERENCES public.tenants(id)`. Correrlo contra la base actual falla al instante por incompatibilidad de tipos.
**Decisión.** `platform.tenants(id UUID PK, slug TEXT UNIQUE NOT NULL, ...)`. El UUID es la llave; el slug es para URLs y para leer.
**Se gana.** Compatibilidad con el paquete legal. Las llaves no se adivinan (un ID enumerable es una filtración de qué clientes tienes). Renombrar una empresa no rompe las FK.
**Se paga.** Las URLs usan slug y hay que resolverlo a UUID en el borde. Es una función y un índice.

### D-03 · Esquemas separados, superficie pública mínima

**Contexto.** Hoy todo vive en `public`, que es exactamente el esquema que PostgREST expone a internet. Una tabla nueva mal configurada queda publicada por defecto.
**Decisión.** Cinco esquemas:

| Esquema | Contenido | Expuesto vía PostgREST |
|---|---|---|
| `platform` | tenants, usuarios, membresías, roles, auditoría global | **No** |
| `core` | datos de negocio del tenant | **No** (sólo a través de `api`) |
| `ingest` | archivos, lotes, filas crudas, mapeos, linaje | **No** |
| `compliance` | privacidad, consentimientos, incidentes, retención | **No** |
| `api` | vistas y funciones que la app consume | **Sí, y sólo este** |

**Se gana.** Fail-closed por construcción: una tabla nueva no queda expuesta salvo que alguien la publique explícitamente en `api`. La superficie de ataque es una lista revisable.
**Se paga.** Hay que declarar cada lectura. Es el costo de no tener `select('*')`.

### D-04 · Ingesta con evidencia: lo crudo es inmutable, lo canónico es publicado

**Contexto.** Hoy el ETL lee Excel y escribe directo a las tablas de negocio. Si una cifra no cuadra, no hay forma de saber de qué fila salió.
**Decisión.** Toda carga pasa por `ingest`: archivo original + hash SHA-256 → lote → filas crudas tal cual → normalización → mapeo → candidatos → reglas → reconciliación → **compuerta** → publicación en `core`.
**Se gana.** Cada cifra del dashboard se puede rastrear hasta la fila del Excel que la produjo. Una fila excluida no desaparece: queda con su motivo.
**Se paga.** Más almacenamiento y una etapa más. A cambio, se termina la clase entera de bugs "el número no cuadra y nadie sabe por qué".

### D-05 · Elegibilidad de venta **invertida** ⚠️

**Contexto.** Los siete paquetes de migración generados y el propio documento del paquete legal usan `Estado_Pedido = 'Cerrado'` como regla de inclusión. Medido contra los datos reales: el campo viene vacío en el 74% de las filas, y la regla **deja fuera el 97,4% de la venta facturada**.
**Decisión.** Se invierte. Se incluye todo documento reconocido salvo exclusión explícita:

```sql
-- ❌ INCORRECTO — la regla que traen los 7 paquetes y el doc legal V1
WHERE estado_pedido = 'Cerrado'

-- ✅ CORRECTO
WHERE tipo_doc IN ('FA','FE','BE','NC','ND')            -- documento reconocido
  AND upper(coalesce(estado_pedido,'')) NOT IN ('ANULADO','NULO','ANULADA')
```

**Se gana.** La venta cuadra contra los totales oficiales. Sin esto, todo el resto del sistema mide sobre el 2,6% de la realidad.
**Se paga.** Hay que mantener la lista de tipos de documento por empresa. Va en la configuración del tenant, no en el código.

> **Acción obligatoria.** Corregir esta frase en `docs/ARQUITECTURA_2.0_LEGAL_SECURITY.md`, sección "Migración KeyFoods → App 2.0". Mientras diga `Estado_Pedido != Cerrado`, el error deja de ser un bug de script y pasa a ser arquitectura escrita.

### D-06 · Las notas de crédito restan; una fila puede generar dos hechos

**Contexto.** 1.995 líneas de NC suman como venta positiva. Sobreestima los ingresos en ~19%. Además, 458 filas traen FA y NC en la misma fila.
**Decisión.** Cada hecho de venta lleva su signo:

```sql
monto_neto = monto_bruto * CASE WHEN tipo_doc IN ('NC') THEN -1 ELSE 1 END
```

Una fila con documento de factura **y** de nota de crédito produce **dos registros** en `core.venta_linea`, cada uno con su `linea_id` propio.
**Se gana.** La venta neta es la venta neta.
**Se paga.** El `linea_id` debe incluir `tipo_doc`, o los dos hechos colisionan.

### D-07 · Los cálculos viven en la base, no en el cliente

**Contexto.** Hoy `Gerencia.jsx` tiene 2.360 líneas y `Ruta.jsx` 1.942, en buena parte porque calculan sobre tablas crudas traídas con `select('*')`. La misma métrica se calcula distinto en dos pantallas.
**Decisión.** Cada pantalla lee **un read model** en `api`: una vista (o vista materializada cuando el costo lo justifique) con las columnas exactas que necesita. La definición de "cliente activo", "cayendo", "brecha" o "mix" existe **una sola vez**, en SQL.
**Se gana.** Menos datos por la red (importa en terreno con 3G). Una sola definición por métrica. Las páginas bajan a cientos de líneas.
**Se paga.** Cambiar una métrica es una migración, no un commit al front. Es deseable: es exactamente el control que hoy no existe.

### D-08 · Una hoja de estilo, tokens, `!important` prohibido

**Contexto.** 11 hojas, 154 `!important`, 128 concentrados en `v90-fixes.css`. Los arreglos aparecían en el código y no en el navegador.
**Decisión.** `tokens.css` (variables) + `app.css` (todo lo demás). `!important` está prohibido; el guard lo bloquea salvo lista blanca con motivo escrito.
**Se gana.** El estilo se vuelve predecible.
**Se paga.** Una pasada de reescritura del CSS. Es acotado y es lo único del front que realmente exige rehacerse.

### D-09 · El token de catálogo es una credencial

**Contexto.** Hoy se guarda en texto plano y se compara con `WHERE token = trim(p_token)`. Sin expiración, sin revocación, sin límite de intentos.
**Decisión.** Se guarda **sólo el hash**. El token se muestra una vez, al generarlo. Expirable, revocable, con `last_access_at`, contador y rate limit por token e IP. Nunca alcanza para leer nada fuera del catálogo publicado. El enlace se abre con `noopener,noreferrer` para no filtrarlo por `Referer`.
**Se gana.** Una copia de la base deja de ser una copia de todas las credenciales de catálogo.
**Se paga.** Un token perdido no se recupera, se rota. Es el comportamiento correcto.

### D-10 · RLS fail-closed y forzado

**Decisión.** Toda tabla de `core` y `platform` con `ENABLE ROW LEVEL SECURITY` **y** `FORCE ROW LEVEL SECURITY` (que aplica también al dueño de la tabla). Sin política permisiva por defecto. El `tenant_id` sale del JWT, nunca de un parámetro que mande el cliente.
**Se gana.** Un `WHERE tenant_id` olvidado en una consulta nueva no cruza el límite entre empresas.
**Se paga.** Hay que escribir la política de cada tabla. Un diagnóstico automático lista las tablas sin política y **bloquea el deploy**.

### D-11 · Cero secretos en el repositorio

**Decisión.** `service_role` sólo en GitHub Actions Secrets y Colab Secrets. El repositorio sólo puede contener la `anon key`. El guard corre un detector de secretos y bloquea.

### D-12 · Toda cifra es explicable

**Decisión.** Cada número de dashboard puede responder de qué lote, archivo y filas salió. Y toda recomendación automática (a quién visitar, qué ofrecerle) registra la versión de la regla y las variables que usó.
**Se gana.** Además de ser exigencia legal para decisiones automatizadas, es lo que convierte una discusión de "el sistema está mal" en una consulta de treinta segundos.

### D-13 · Escritura offline idempotente

**Decisión.** Toda operación que nace en el teléfono lleva un `client_op_id` (UUID generado en el dispositivo). El servidor aplica `ON CONFLICT DO NOTHING` sobre él. Reintentar diez veces produce un registro.
**Se gana.** El vendedor puede reintentar sin miedo a duplicar un pedido.

### D-14 · Disciplina de entrega

Se mantienen las cinco reglas de la 15.3 y se agregan tres:

1. Una sola rama.
2. Nada se sube sin `npm run verify` verde.
3. Ninguna consulta falla en silencio.
4. Colores de marca en hex literal, nunca `var()` (referencia circular que mató el branding).
5. Una función SQL, un solo archivo.
6. **Ninguna tabla sin política RLS.**
7. **Ningún `select('*')` en producción.**
8. **Ningún secreto en el repositorio.**

---

## 4 · Los cuatro planos

```
┌─────────────────────────────────────────────────────────────┐
│  platform · control plane                                   │
│  tenants · usuarios · membresías · roles · auditoría global  │
│  (superadmin y platform_admin — nunca el ejecutivo)          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  core · datos del tenant                                     │
│  clientes · productos · precios · stock · zonas · ventas     │
│  pedidos · visitas · checkins · notas · catálogo             │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  ingest · evidencia y linaje                                 │
│  archivo+hash · lote · fila cruda · normalización · mapeo    │
│  candidato · regla aplicada · reconciliación · publicación   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  compliance · privacidad y seguridad                         │
│  actividades · consentimientos · derechos · incidentes       │
│  retención · encargados · decisiones automatizadas           │
└─────────────────────────────────────────────────────────────┘
                            ▲
                    api · única superficie expuesta
```

---

## 5 · Modelo de datos canónico

Sólo las columnas que definen la estructura. El detalle completo va en cada migración.

### 5.1 · `platform`

```
tenants(id UUID PK, slug TEXT UNIQUE, nombre, color, logo_url,
        activo, config JSONB, creado_en)
usuarios(id UUID PK = auth.uid, email, nombre, activo)
membresias(usuario_id, tenant_id, rol, zona_id, activo, creado_en)
        rol ∈ superadmin | tenant_admin | gerencia | ejecutivo | solo_lectura
roles_permisos(rol, permiso)
auditoria(id, tenant_id, actor_id, accion, objeto, antes JSONB,
          despues JSONB, ip, user_agent, creado_en)
```

`membresias` reemplaza a la mezcla actual de `ejecutivos` + `tenant_members`. Un usuario puede pertenecer a varios tenants con roles distintos; el superadmin es la excepción y queda registrada.

### 5.2 · `core`

```
cliente(tenant_id, cliente_key, nombre, comuna, direccion, lat, lng,
        rubro, zona_id, ejecutivo_id, es_bloqueado, motivo_bloqueo,
        activo, PK(tenant_id, cliente_key))
producto(tenant_id, sku, nombre, categoria, marca, unidad_venta,
         unidades_caja, kg_unidad, kg_caja, activo, PK(tenant_id, sku))
precio(tenant_id, sku, lista, precio_unidad, precio_caja, precio_kilo,
       vigente_desde, vigente_hasta)
stock(tenant_id, sku, almacen, stock_total, stock_cajas, fecha_venc,
      es_foco_mes, actualizado_en)
zona(tenant_id, id, nombre, activo)
zona_comuna(tenant_id, comuna, zona_id)
venta_linea(tenant_id, linea_id PK, cliente_key, fecha, sku, tipo_doc,
            documento, estado_pedido, cantidad, monto_neto, costo_unitario,
            lote_id, creado_en)
pedido(tenant_id, id, cliente_key, ejecutivo_id, estado, origen,
       lineas JSONB, total, client_op_id UNIQUE, creado_en)
visita / checkin / nota_cliente / encuesta
        (todas con tenant_id, ejecutivo_id, client_op_id UNIQUE)
oferta_cliente(tenant_id, cliente_key, skus, activo, creado_en)
catalog_token(tenant_id, token_hash, recurso_tipo, recurso_id,
              expira_en, revocado_en, ultimo_acceso, accesos)
meta(tenant_id, ejecutivo_id, mes, monto)   foco(tenant_id, mes, sku, meta)
```

**Sobre `venta_linea`:** hoy `tipo_doc` y `estado_pedido` los lee `CICLO_UNICO.py` pero **nunca los escribe** en `ventas_lineas`, así que nunca llegan a la base. En la 2.0 son columnas de primer nivel, porque D-05 y D-06 dependen de ellas.

`linea_id = sha256(tenant_id | cliente_key | fecha | tipo_doc | documento | sku | monto)`
Incluye `tipo_doc` para que una fila con FA y NC produzca dos llaves distintas (D-06).

### 5.3 · `ingest`

```
archivo(id, tenant_id, tipo, nombre_original, sha256, bytes,
        subido_por, subido_en)         -- sha256 detecta recarga del mismo archivo
lote(id, tenant_id, archivo_id, estado, filas_leidas, filas_validas,
     filas_excluidas, iniciado_en, publicado_en)
        estado ∈ recibido | normalizado | validado | publicado | rechazado
fila_cruda(lote_id, nro_fila, datos JSONB)          -- inmutable
fila_norm(lote_id, nro_fila, datos JSONB, mapeo_version)
exclusion(lote_id, nro_fila, regla, detalle)        -- nada desaparece
reconciliacion(lote_id, metrica, valor_calculado, valor_oficial,
               diferencia, aprobado_por, aprobado_en)
```

### 5.4 · `compliance`

Se adopta el paquete legal V1 con dos correcciones: `tenant_id` pasa a UUID (D-02) y las tablas se mueven de `public` al esquema `compliance` (D-03).

```
processing_activities · consents · data_subject_requests
security_incidents · retention_policies · processors
security_baseline_checks · automated_decisions
```

---

## 6 · Contrato de datos — los 4 archivos (v3)

Se mantiene la estructura de `archivos.v2.json`, que es correcta y es el activo comercial del producto. Los cambios de la v3:

| Cambio | Motivo |
|---|---|
| `tipo_doc` pasa de opcional a **obligatorio en ventas** | Sin él no se pueden restar las NC (D-06). Si la empresa no lo trae, se declara un valor por defecto en la config del tenant y queda registrado |
| `estado_pedido` se documenta explícitamente | Hoy se lee y se descarta. Pasa a columna de `venta_linea` |
| Regla de elegibilidad escrita en el contrato | Para que ningún consumidor la reinvente (D-05) |
| Detección de solapamiento entre archivos | Los dos archivos de venta de KeyFoods se solapan en 99,99%. La ingesta lo detecta por hash y por rango de fechas, y **avisa antes de publicar** |
| Alertas de calidad | 57 SKU sin precio, clientes con zona y comuna contradictorias, clientes de venta que no están en la maestra |

**El mínimo se mantiene en 13 columnas** (más `tipo_doc` o su valor por defecto declarado):

```
precios  · sku, nombre, precio_unidad|precio_caja
stock    · sku, stock_total
maestra  · cliente_key, ejecutivo, zona
ventas   · cliente_key, fecha, sku, monto, cantidad
```

**La maestra manda.** El ejecutivo y la zona de cada cliente salen de la maestra, nunca de `vendedor_origen` (que puede traer literalmente `'SEGUN_MAESTRA'`). El vendedor de la factura se conserva **sólo para auditoría**.

---

## 7 · El pipeline de ingesta

```
1  RECIBIR     archivo + sha256 → ¿ya fue cargado? → aviso
2  LEER        fila_cruda, tal cual, sin interpretar
3  NORMALIZAR  alias de columnas → nombres canónicos (contrato v3)
4  MAPEAR      cliente_key ↔ maestra · sku ↔ precios
5  APLICAR     reglas de elegibilidad (D-05) y signo (D-06)
               las filas excluidas quedan en `exclusion` con motivo
6  RECONCILIAR venta total del lote vs total oficial del mes
               conteo de clientes · conteo de documentos
7  COMPUERTA   diferencia > umbral → RECHAZADO, no se publica
8  PUBLICAR    upsert idempotente por linea_id hacia core
9  LINAJE      cada fila de core apunta a su lote
```

**Regla operativa que no se negocia:** el sistema nunca arregla una cifra borrando datos. Si el reporte no cuadra, se bloquea la publicación, se diagnostica, se corrige el origen y se vuelve a correr. La ejecución es idempotente, así que reintentar es seguro.

---

## 8 · Capa de consulta — contrato por pantalla

Cada pantalla lee **una** vista de `api` con columnas explícitas.

| Pantalla | Read model | Qué entrega | Invariantes |
|---|---|---|---|
| **Hoy** | `api.mi_dia` | Venta MTD, avance a meta, clientes activos, brecha de cartera, a quién llamar hoy, cartera cayendo, nuevos y recuperados, venta cruzada | Filtra por ejecutivo del JWT. Un cliente bloqueado nunca aparece como oportunidad de venta |
| **Ruta** | `api.ruta_dia` | Paradas ordenadas por GPS, con oferta por parada | Sólo clientes con comuna **y** coordenadas. Los que no tienen salen en el panel de integridad, no se ocultan |
| **Cartera** | `api.cartera` | Cliente, estado, venta MTD, promedio 3M, brecha, días sin comprar | El estado se calcula en SQL, una sola vez |
| **Stock** | `api.stock_vendible` | SKU vendible = tiene precio **y** stock > 0 | Un SKU con stock y sin precio es operativo, no vendible: sale marcado `SIN_PRECIO_LISTA` |
| **Catálogo cliente** | `api.get_catalogo(token)` | Catálogo publicado para ese cliente | Función `SECURITY DEFINER` con `search_path` fijo, validación de token por hash, rate limit |
| **Gerencia** | `api.gerencia_*` | Ver sección 9 | Nunca cruza el `tenant_id` |
| **Admin** | `api.admin_*` | Zonas, metas, focos, usuarios, cargas | Toda escritura deja auditoría |

**Cómo se consume desde el front:** se conservan `safeSelect` y `useDatos` tal como están. Lo que cambia es que `construir()` apunta a una vista de `api` y declara columnas, en vez de traer una tabla cruda con `*`.

---

## 9 · Dashboard de gerencia — métricas con fórmula única

Cada métrica se define **una sola vez**, en SQL, con su fórmula escrita.

| Métrica | Fórmula | Corrección respecto de la 15.3 |
|---|---|---|
| Venta MTD | `Σ monto_neto` del mes, con signo (D-06) | Hoy las NC suman positivo: ~19% de sobreestimación |
| Margen | `(venta_neta − costo) / venta_neta` | Sin cambio |
| Cobertura de cartera | clientes con compra en el mes / clientes vivos | Sin cambio |
| Brecha de cartera | `Σ (promedio_3m − venta_mtd)` para los que caen | Sin cambio |
| **Mix %** | `venta_sku_mes / venta_total_mes` | **Corregido**: hoy `promClp` se calcula por línea de factura en vez de por mes, lo que lo infla |
| Avance a foco | vendido / meta del foco, por zona | Sin cambio |
| Ventas bajo costo | líneas con `monto_neto < costo` | Sin cambio |

**Paneles de integridad** (nuevos, y son los que evitan la pregunta "¿por qué no aparece este cliente?"):

- Clientes con zona y comuna contradictorias — hoy no los ve **nadie**: la consulta los trae por zona y el filtro los descarta por comuna
- SKU con stock y sin precio de lista (57 en KeyFoods)
- Clientes con venta que no están en la maestra
- Zonas con `venta_linea` vacía (hoy: Sur Capital)
- Estado del último lote y su reconciliación

---

## 10 · Catálogo público

Es la única superficie que toca internet sin sesión. Se trata como tal.

```
generar   → token aleatorio (32 bytes) · se guarda sólo sha256
            se muestra una vez · expira · quedan registrados quién y cuándo
abrir     → api.get_catalogo(token)
            valida formato → busca por hash → verifica expiración y revocación
            registra acceso → aplica rate limit (token + IP)
            devuelve SÓLO productos publicados de ese cliente
pedir     → api.crear_pedido_publico(token, lineas, nota)
            idempotente por client_op_id · valida precios en servidor
revocar   → un UPDATE. El enlace muere al instante
```

El precio y la disponibilidad **siempre** se revalidan en el servidor: lo que llega del cliente es una intención, no un dato.

---

## 11 · Seguridad

| Control | Implementación |
|---|---|
| Aislamiento | RLS fail-closed + `FORCE`. `tenant_id` desde el JWT, nunca desde parámetro |
| Autorización | `platform.membresias` + matriz rol/permiso. Validación en servidor; el front sólo oculta |
| Funciones privilegiadas | `SECURITY DEFINER` con `search_path` fijo y `REVOKE EXECUTE FROM PUBLIC` |
| Columnas | Lista explícita siempre. Prohibido `SELECT *` (guard) |
| Secretos | Fuera del repositorio. `service_role` sólo en Actions/Colab |
| Auditoría | Toda acción administrativa y de seguridad deja registro con actor, antes/después, IP |
| Cabeceras | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, protección de framing |
| Enlaces externos | `noopener,noreferrer` |
| Logs | Nunca JWT, tokens ni datos de cliente en consola |
| Rate limit | Catálogo, pedido público y login |

---

## 12 · Ley 21.719 — de la obligación al control técnico

**Contexto verificable:** la ley se publicó el 13 de diciembre de 2024 y entra en vigencia plena el **1 de diciembre de 2026**, con un plazo de adecuación de 24 meses. Crea la Agencia de Protección de Datos Personales con facultades de fiscalización y sanción, incorpora derechos ARCO más portabilidad y bloqueo, exige notificar brechas y contempla multas de hasta 20.000 UTM, con hasta 4% de los ingresos anuales en reincidencia grave. Aplica a toda organización que trate datos personales en Chile, sin importar el tamaño.

Para este producto hay un matiz que conviene tener claro desde ahora: Black Sheep es **encargado de tratamiento** respecto de los datos que carga cada distribuidora, y **responsable** respecto de los datos de sus propios usuarios. Son dos roles distintos con obligaciones distintas, y el modelo de datos tiene que poder distinguirlos.

### Mapeo

| Obligación | Control técnico | Dónde vive |
|---|---|---|
| Licitud y finalidad | Registro de actividades de tratamiento con base de legitimidad declarada | `compliance.processing_activities` |
| Base de legitimidad | No se fuerza consentimiento donde aplica contrato, obligación legal o interés legítimo. Si hay consentimiento, queda evidencia de versión, fecha, medio y retiro | `compliance.consents` |
| Proporcionalidad | Columnas explícitas, sin `SELECT *`. Catálogo de datos que marca qué campo es personal | D-03, D-07 |
| Calidad | Compuerta de reconciliación antes de publicar | `ingest.reconciliacion` |
| Seguridad | RLS, RBAC, hash de tokens, auditoría, rate limit | Sección 11 |
| Transparencia | Política de privacidad versionada por tenant | `compliance.processing_activities.privacy_policy_version` |
| Derechos ARCOP + bloqueo | Registro de solicitud, plazo, decisión, evidencia y responsable | `compliance.data_subject_requests` |
| Plazo de 30 días | Vencimiento calculado y alerta en el panel de cumplimiento | idem |
| Notificación de brechas (72 h) | Flujo de incidente con detección, severidad, evaluación de riesgo, contención y comunicaciones | `compliance.security_incidents` |
| Encargados | Registro de proveedores, finalidad, categorías, ubicación, subencargados | `compliance.processors` |
| Decisiones automatizadas | Toda recomendación registra finalidad, versión de la regla, variables y revisión humana disponible | `compliance.automated_decisions` (D-12) |
| Retención | Política por finalidad y tipo de dato, separando lo que la ley obliga a conservar | `compliance.retention_policies` |
| Protección desde el diseño | Este documento y los chequeos bloqueantes del baseline | `compliance.security_baseline_checks` |

### Qué datos personales hay realmente acá

No todo dato de negocio es dato personal, y tratarlos todos igual es tan malo como no tratarlos.

- **Personales:** nombre de contacto, teléfono, correo, notas de visita, GPS del ejecutivo, actividad de usuarios, y el RUT cuando el cliente es persona natural (en foodservice pasa: almacenes, carros, negocios unipersonales).
- **De negocio, no personales:** SKU, stock, precio, venta por producto de una empresa.

El catálogo de datos tiene que marcar campo por campo cuál es cuál. El diseño no debe asumir que todo `cliente_key` es dato personal ni que ninguno lo es.

### Lo que esta arquitectura **no** resuelve

Hay que decirlo con todas las letras: las tablas no son un programa de cumplimiento. Fuera del alcance técnico quedan, y hay que resolverlos antes de vender a la segunda distribuidora:

- Contrato de encargado de tratamiento (DPA) entre Black Sheep y cada cliente
- Política de privacidad y aviso a titulares
- Designación de quién responde solicitudes y en qué plazo
- Evaluación de impacto si se hace scoring con efectos relevantes sobre personas
- Procedimiento de notificación de brechas, con responsable y canal
- **Revisión de un abogado.** Este documento es arquitectura técnica, no asesoría legal.

---

## 13 · Plan de migración

### Fase 0 · hasta la feria (6 → 30 de septiembre)

**Congelar V15.3.** Sólo hotfix de producción. La demo de Espacio Riesco corre sobre lo que ya funciona.

En paralelo, sin tocar la app: corregir el documento legal (D-05), decidir las preguntas abiertas de la sección 15 y escribir las migraciones de fundación.

### Fase 1 · fundación (octubre, semanas 1–2)

Proyecto Supabase nuevo. Migraciones `000`–`013`. Ingesta de los 4 archivos de KeyFoods **con histórico completo**. Reconciliación contra los totales oficiales del mes. **Criterio de aceptación: la venta de la 2.0 cuadra con la venta real de KeyFoods.** Si no cuadra, no se avanza.

### Fase 2 · lectura (octubre, semanas 3–4)

Read models y pantallas nuevas leyendo desde la 2.0. La 15.3 sigue viva. Se comparan las dos en paralelo: mismo mes, mismos números.

### Fase 3 · escritura (noviembre, semanas 1–2)

Pedidos, check-ins y notas escriben en la 2.0, con la cola offline idempotente. Catálogo público migrado a tokens con hash.

### Fase 4 · corte (noviembre, semanas 3–4)

Se apaga la 15.3. La 2.0 queda operativa **antes del 1 de diciembre**, que es cuando la ley empieza a ser exigible.

### Numeración canónica de migraciones

Una secuencia, sin colisiones, una función por archivo (regla 5 y guard R8):

```
000_extensions          008_core_field_ops        016_privacy_compliance ←
001_schemas             009_core_catalogo         017_security_baseline  ←
002_platform_tenants    010_ingest_plane          018_retention
003_platform_rbac       011_read_models           019_diagnostics
004_core_reference      012_rls_foundation
005_core_clientes       013_grants
006_core_productos      014_api_publica           ← catalog_tokens (012 del paquete)
007_core_ventas         015_audit
```

Las flechas marcan dónde entra el paquete legal V1. Correcciones necesarias antes de ejecutarlo:

1. `tenant_id UUID` contra `platform.tenants(id)` — hoy apunta a `public.tenants(id)`, que es TEXT y **falla al primer `RUN`**
2. Mover de `public` al esquema `compliance`
3. El README del paquete lista dos archivos distintos numerados `003` — se renumera

---

## 14 · Recomendaciones

Además de lo que preguntaste, cuatro cosas que conviene decidir ahora y no después.

**1. Congelar la 15.3 hasta la feria.** Es la recomendación con más impacto de todo el documento. La tentación de "aprovechar y arreglar esto en la 15.3" es exactamente lo que produjo las 11 hojas de estilo.

**2. La reconciliación es el criterio de éxito de la migración, no la cantidad de pantallas.** Una 2.0 con tres pantallas y números que cuadran vale más que una completa con la venta mal calculada. Ponlo como compuerta explícita entre Fase 1 y Fase 2.

**3. El linaje es lo que se vende.** Un competidor puede copiar las pantallas. Poder decirle a un gerente "esta cifra sale de estas 43 filas de tu propio Excel" es lo que hace que confíe en el sistema. Es característica comercial, no infraestructura.

**4. Automatizar el ETL antes de la segunda distribuidora, no después.** Hoy corre a mano en Colab. Con un cliente es un ritual; con tres es un trabajo de tiempo completo. Faltan los secrets de GitHub Actions (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_MAPS_API_KEY`, `GDRIVE_SA_JSON`, `GDRIVE_FOLDER_ID`).

---

## 15 · Decisiones abiertas

Necesito estas respuestas para escribir las migraciones:

| # | Decisión | Opciones | Mi recomendación |
|---|---|---|---|
| A | ¿Proyecto Supabase nuevo o el mismo con esquemas nuevos? | Nuevo / mismo | **Nuevo.** Aísla el riesgo y permite borrar y recomenzar sin tocar producción |
| B | ¿La 2.0 conserva el histórico de pedidos, check-ins y notas de la 15.3? | Sí / empezar limpio | **Sí, migrar.** Es evidencia comercial y el vendedor pierde confianza si desaparece |
| C | ¿Qué tipos de documento cuentan como venta en KeyFoods? | Confirmar la lista real | Necesito los valores reales de `tipo_doc` en el Excel para cerrar D-05 |
| D | ¿El costo unitario viene en el archivo de ventas o hay que traerlo aparte? | — | Sin esto, margen y "ventas bajo costo" no se pueden calcular en la 2.0 |
| E | ¿Hay clientes persona natural en la cartera? | Sí / no / no se sabe | Define cuánto pesa el módulo de privacidad desde el día uno |

---

## Anexo A · Mediciones de la V15.3

Tomadas sobre `BLACKSHEEP_V153.zip`, 6 de septiembre de 2026.

```
Archivos totales                      436
LOC JS/JSX (apps/field, sin tests)  25.492
Archivos de test                       51
Archivos SQL                           51
Hojas de estilo                        11  (~7.900 líneas)
!important                            154  (128 en v90-fixes.css)
select('*') en producción              37  (en 15 archivos)
Páginas > 1.000 líneas                  4  (Gerencia 2.360 · Ruta 1.942 ·
                                            Visita 1.516 · Cartera 1.273)
tenants.id                           TEXT
Token de catálogo             texto plano
```

## Anexo B · Hallazgos de integridad pendientes

Todos medidos contra datos reales. Cada uno tiene su solución en este documento.

| Hallazgo | Efecto | Resuelto por |
|---|---|---|
| Regla `Estado_Pedido = Cerrado` | Excluye 97,4% de la venta facturada | D-05 |
| 1.995 líneas de NC suman positivo | ~19% de sobreestimación | D-06 |
| 458 filas con FA y NC juntas | Un hecho donde debería haber dos | D-06 |
| `tipo_doc` y `estado_pedido` nunca se escriben | Los datos no llegan a la base | §5.2 |
| Dos archivos de venta con 99,99% de solape | Riesgo de duplicar todo | §6 |
| `mix%` calculado por línea y no por mes | Métrica inflada | §9 |
| 57 SKU sin precio de lista | "Sin precio" en el catálogo | §6, §9 |
| `ventas_lineas` vacío en Sur Capital | Zona ciega | §9 |
| Zona y comuna contradictorias | El cliente no lo ve nadie | §9 |
