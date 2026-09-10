-- ═══════════════════════════════════════════════════════════════════
-- BLACK SHEEP · APP 2.0 · INSTALACIÓN COMPLETA
-- Las 31 migraciones, en orden, en un solo archivo. Idempotente.
-- Supabase → SQL Editor → pegar TODO → Run.
-- ═══════════════════════════════════════════════════════════════════



-- ███ 000_extensions.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 000 · EXTENSIONES
-- Idempotente. Primera migración de la App 2.0.
-- ═══════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid, digest, hmac
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- búsqueda por nombre de cliente/producto

-- En Supabase pgcrypto suele estar en el esquema `extensions`; en una
-- instalación estándar queda en `public`. Las funciones que la usan
-- listan ambos esquemas en su search_path (ver 014).


-- ███ 001_schemas.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 001 · ESQUEMAS
--
-- D-03 · Superficie pública mínima.
-- PostgREST expone SOLO el esquema `api`. Una tabla nueva en core,
-- platform, ingest o compliance NO queda publicada por accidente.
--
-- En Supabase hay que declararlo además en:
--   Settings → API → Exposed schemas → `api`
-- Quitar `public` de esa lista es parte del despliegue.
-- ═══════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS platform;    -- control plane
CREATE SCHEMA IF NOT EXISTS core;        -- datos de negocio del tenant
CREATE SCHEMA IF NOT EXISTS ingest;      -- evidencia y linaje
CREATE SCHEMA IF NOT EXISTS compliance;  -- privacidad y seguridad
CREATE SCHEMA IF NOT EXISTS api;         -- ÚNICA superficie expuesta

COMMENT ON SCHEMA platform   IS 'Control plane: tenants, usuarios, roles, auditoría. No expuesto.';
COMMENT ON SCHEMA core       IS 'Datos de negocio por tenant. No expuesto: se lee vía api.';
COMMENT ON SCHEMA ingest     IS 'Archivos, lotes, filas crudas y linaje. No expuesto.';
COMMENT ON SCHEMA compliance IS 'Privacidad, incidentes, retención. No expuesto.';
COMMENT ON SCHEMA api        IS 'Vistas y funciones que consume la app. Único esquema expuesto.';

-- Fail-closed: nadie tiene nada hasta que 013_grants lo otorgue.
REVOKE ALL ON SCHEMA platform, core, ingest, compliance, api FROM PUBLIC;


-- ███ 002_platform_tenants.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 002 · TENANTS Y CONTEXTO DE SESIÓN
--
-- D-02 · id UUID + slug legible.
--   El UUID es la llave (no se enumera: un id correlativo filtra
--   cuántos clientes tienes). El slug es para URLs y para leer.
--
-- Acá viven también las funciones de contexto. TODA política RLS
-- las usa. No leen parámetros del cliente: leen el JWT.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE
                CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  nombre        TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#a3e635'
                CHECK (color ~ '^#[0-9a-fA-F]{6}$'),   -- hex literal, nunca var() (regla 4)
  logo_url      TEXT,
  zona_horaria  TEXT NOT NULL DEFAULT 'America/Santiago',
  moneda        TEXT NOT NULL DEFAULT 'CLP',
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN platform.tenants.config IS
  'Config por empresa. Claves reconocidas:
     fuente_costo      : ventas | lista | ninguno   (D-04)
     dias_ciclo_default: entero
     iva               : numérico
   Nada de esto vive en el código: onboarding sin tocar el build (R5).';

-- ─── Contexto de sesión ────────────────────────────────────────────
-- Lee el JWT. Nunca un parámetro que mande el cliente.

CREATE OR REPLACE FUNCTION platform.jwt()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION platform.usuario_actual()
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, platform AS $$
  SELECT NULLIF(platform.jwt() ->> 'sub', '')::uuid;
$$;

-- El tenant sale de app_metadata (lo escribe el servidor al emitir el
-- token). Si viniera en el cuerpo del token editable por el cliente,
-- todo el aislamiento sería decorativo.
CREATE OR REPLACE FUNCTION platform.tenant_actual()
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, platform AS $$
  SELECT NULLIF(
    COALESCE(
      platform.jwt() -> 'app_metadata' ->> 'tenant_id',
      platform.jwt() ->> 'tenant_id'
    ), ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION platform.es_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(
    platform.jwt() -> 'app_metadata' ->> 'rol_plataforma', ''
  ) = 'superadmin';
$$;

-- La suscripción y el corte por impago viven en 020_suscripciones.sql.
-- Un objeto, un archivo (regla 5): dos definiciones de la misma tabla
-- es exactamente el bug `activo` vs `activa` de la 15.3.


-- ███ 003_platform_rbac.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 003 · USUARIOS, MEMBRESÍAS Y PERMISOS
--
-- Reemplaza la mezcla de `ejecutivos` + `tenant_members` de la 15.3.
-- Un usuario puede pertenecer a varios tenants con roles distintos.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.usuarios (
  id         UUID PRIMARY KEY,          -- = auth.users.id de Supabase
  email      TEXT NOT NULL UNIQUE,
  nombre     TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.membresias (
  usuario_id UUID NOT NULL REFERENCES platform.usuarios(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES platform.tenants(id)  ON DELETE CASCADE,
  rol        TEXT NOT NULL CHECK (rol IN
             ('tenant_admin','gerencia','ejecutivo','solo_lectura')),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS ix_membresias_tenant
  ON platform.membresias (tenant_id) WHERE activo;

CREATE TABLE IF NOT EXISTS platform.rol_permiso (
  rol     TEXT NOT NULL,
  permiso TEXT NOT NULL,
  PRIMARY KEY (rol, permiso)
);

INSERT INTO platform.rol_permiso (rol, permiso) VALUES
  ('tenant_admin','cargar_datos'), ('tenant_admin','publicar_lote'),
  ('tenant_admin','gestionar_usuarios'), ('tenant_admin','gestionar_zonas'),
  ('tenant_admin','ver_gerencia'), ('tenant_admin','ver_contacto'),
  ('tenant_admin','ver_costo'), ('tenant_admin','emitir_catalogo'),
  ('gerencia','cargar_datos'), ('gerencia','ver_gerencia'), ('gerencia','ver_costo'),
  -- Gerencia también toma pedidos: contesta el teléfono cuando el
  -- cliente llama a la oficina en vez de esperar al vendedor.
  ('gerencia','crear_pedido'), ('gerencia','registrar_visita'),
  ('gerencia','gestionar_zonas'), ('gerencia','ver_contacto'),
  ('gerencia','publicar_lote'),
  ('ejecutivo','ver_cartera_propia'), ('ejecutivo','registrar_visita'),
  ('ejecutivo','crear_pedido'), ('ejecutivo','ver_contacto'),
  ('ejecutivo','emitir_catalogo'),
  ('solo_lectura','ver_cartera_propia')
ON CONFLICT DO NOTHING;

-- ─── Acceso · SECURITY DEFINER a propósito ─────────────────────────
-- Si las políticas RLS de core consultaran `membresias` directamente y
-- `membresias` tiene RLS, se produce recursión infinita. Esta función
-- rompe el ciclo. Por eso lleva search_path fijo y REVOKE de PUBLIC.

CREATE OR REPLACE FUNCTION platform.rol_en_tenant(p_tenant UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT CASE WHEN platform.es_superadmin() THEN 'tenant_admin' ELSE (
    SELECT m.rol FROM platform.membresias m
     WHERE m.usuario_id = platform.usuario_actual()
       AND m.tenant_id  = p_tenant
       AND m.activo
     LIMIT 1
  ) END;
$$;

CREATE OR REPLACE FUNCTION platform.tiene_acceso(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT p_tenant IS NOT NULL
     AND p_tenant = platform.tenant_actual()
     AND platform.rol_en_tenant(p_tenant) IS NOT NULL;
     -- 020 EXTIENDE esta función con el corte por impago. Se define en
     -- dos pasos porque la suscripción todavía no existe acá; la
     -- definición final, la que manda, es la de 020.
$$;

COMMENT ON FUNCTION platform.tiene_acceso(UUID) IS
  'Puerta única de todas las políticas RLS: tenant correcto + membresía
   activa (+ suscripción vigente, que agrega 020). Si alguna condición
   falla, la fila no existe para ese usuario.';

CREATE OR REPLACE FUNCTION platform.puede(p_permiso TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.rol_permiso rp
     WHERE rp.permiso = p_permiso
       AND rp.rol = platform.rol_en_tenant(platform.tenant_actual())
  );
$$;

REVOKE ALL ON FUNCTION platform.rol_en_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.tiene_acceso(UUID)  FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.puede(TEXT)         FROM PUBLIC;


-- ███ 004_core_reference.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 004 · REFERENCIA: ZONAS, COMUNAS Y EJECUTIVOS
--
-- Las zonas son datos, no constantes. Otra distribuidora define las
-- suyas sin tocar código (R5).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.zona (
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  id        TEXT NOT NULL,                     -- 'NOR-ORIENTE'
  nombre    TEXT NOT NULL,
  color     TEXT CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  activo    BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS core.zona_comuna (
  tenant_id UUID NOT NULL,
  comuna    TEXT NOT NULL,                     -- normalizada: sin tilde, mayúscula
  zona_id   TEXT NOT NULL,
  PRIMARY KEY (tenant_id, comuna),
  FOREIGN KEY (tenant_id, zona_id) REFERENCES core.zona(tenant_id, id) ON DELETE CASCADE
);

-- El ejecutivo existe aunque todavía no tenga cuenta: la maestra trae
-- nombres antes de que nadie se registre. `usuario_id` se enlaza después.
CREATE TABLE IF NOT EXISTS core.ejecutivo (
  tenant_id  UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  email      TEXT,
  usuario_id UUID REFERENCES platform.usuarios(id) ON DELETE SET NULL,
  zona_id    TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, zona_id) REFERENCES core.zona(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ix_ejecutivo_usuario
  ON core.ejecutivo (tenant_id, usuario_id) WHERE usuario_id IS NOT NULL;

-- Qué documentos cuentan como venta y con qué signo.
-- D-05 y D-06 dejan de ser constantes del código: son datos por tenant.
CREATE TABLE IF NOT EXISTS core.tipo_documento (
  tenant_id        UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  codigo           TEXT NOT NULL,              -- 'FA', 'NC', 'BE'…
  descripcion      TEXT,
  cuenta_como_venta BOOLEAN NOT NULL DEFAULT TRUE,
  signo            SMALLINT NOT NULL DEFAULT 1 CHECK (signo IN (-1, 1)),
  PRIMARY KEY (tenant_id, codigo)
);

COMMENT ON TABLE core.tipo_documento IS
  'D-05/D-06. Una nota de crédito lleva signo -1. Un documento que no
   está acá NO entra a la venta y queda registrado en ingest.exclusion
   con motivo TIPO_DOC_DESCONOCIDO: no desaparece, se ve.';

-- Estados que anulan una venta, por tenant.
CREATE TABLE IF NOT EXISTS core.estado_excluido (
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  estado    TEXT NOT NULL,                     -- 'ANULADO', 'NULO'…
  PRIMARY KEY (tenant_id, estado)
);

COMMENT ON TABLE core.estado_excluido IS
  'D-05 · Regla INVERTIDA. Se incluye todo documento reconocido SALVO
   que su estado esté acá. La regla directa (estado = Cerrado) dejaba
   fuera el 97,4% de la venta facturada porque el campo viene vacío en
   el 74% de las filas.';


-- ███ 005_core_clientes.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 005 · CLIENTES
--
-- Privacidad por diseño (Ley 21.719): los datos de la EMPRESA y los
-- datos PERSONALES de sus contactos viven en tablas separadas, con
-- permisos separados. `cliente` no contiene datos personales salvo el
-- caso de persona natural, que va marcado.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.cliente (
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  cliente_key    TEXT NOT NULL,                -- RUT normalizado u otra llave
  nombre         TEXT,
  comuna         TEXT,
  direccion      TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  rubro          TEXT,
  zona_id        TEXT,
  ejecutivo_id   TEXT,
  es_persona_natural BOOLEAN NOT NULL DEFAULT FALSE,
  es_bloqueado   BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueo TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  lote_id        UUID,                          -- linaje (D-12)
  -- Procedencia (026): qué campos se editaron a mano y de dónde salió
  -- la fila. Sin esto, la próxima carga de la maestra pisa cualquier
  -- corrección hecha desde el dashboard.
  campos_manuales TEXT[] NOT NULL DEFAULT '{}',
  origen         TEXT NOT NULL DEFAULT 'archivo'
                 CHECK (origen IN ('archivo','dashboard','terreno')),
  es_prospecto   BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cliente_key),
  FOREIGN KEY (tenant_id, zona_id)      REFERENCES core.zona(tenant_id, id),
  FOREIGN KEY (tenant_id, ejecutivo_id) REFERENCES core.ejecutivo(tenant_id, id)
);

COMMENT ON COLUMN core.cliente.es_persona_natural IS
  'Marca de dato personal. Si es TRUE, cliente_key (RUT) y nombre son
   datos personales y quedan sujetos a retención y derechos ARCOP.';

COMMENT ON COLUMN core.cliente.ejecutivo_id IS
  'LA MAESTRA MANDA. Sale del archivo maestra, nunca del vendedor de
   la factura (que puede decir literalmente SEGUN_MAESTRA).';

CREATE INDEX IF NOT EXISTS ix_cliente_ejecutivo
  ON core.cliente (tenant_id, ejecutivo_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_cliente_zona
  ON core.cliente (tenant_id, zona_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_cliente_nombre_trgm
  ON core.cliente USING gin (nombre gin_trgm_ops);

-- ─── Datos personales, aparte ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.cliente_contacto (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  cliente_key  TEXT NOT NULL,
  nombre       TEXT,
  cargo        TEXT,
  telefono     TEXT,
  email        TEXT,
  anonimizado_en TIMESTAMPTZ,                  -- retención (018)
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, cliente_key)
    REFERENCES core.cliente(tenant_id, cliente_key) ON DELETE CASCADE
);

COMMENT ON TABLE core.cliente_contacto IS
  'DATOS PERSONALES. Requiere permiso ver_contacto. Sujeto a derechos
   ARCOP y a política de retención. Nunca se expone en el catálogo.';

CREATE INDEX IF NOT EXISTS ix_contacto_cliente
  ON core.cliente_contacto (tenant_id, cliente_key)
  WHERE anonimizado_en IS NULL;


-- ███ 006_core_productos.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 006 · PRODUCTOS, PRECIOS, COSTOS Y STOCK
--
-- Los tres archivos se cruzan por SKU:
--   precios → QUÉ SE VENDE (base del catálogo)
--   stock   → SI HAY       (disponibilidad, NO catálogo)
--   costo   → cuánto deja  (fuente declarada en tenants.config)
-- Un SKU con stock y sin precio es operativo, no vendible.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.producto (
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  categoria     TEXT,
  familia       TEXT,
  marca         TEXT,
  unidad_venta  TEXT,
  unidades_caja NUMERIC,
  kg_unidad     NUMERIC,
  kg_caja       NUMERIC,
  imagen_url    TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  lote_id       UUID,
  campos_manuales TEXT[] NOT NULL DEFAULT '{}',      -- ver 026
  origen        TEXT NOT NULL DEFAULT 'archivo'
                CHECK (origen IN ('archivo','dashboard')),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS ix_producto_nombre_trgm
  ON core.producto USING gin (nombre gin_trgm_ops);

CREATE TABLE IF NOT EXISTS core.precio (
  tenant_id     UUID NOT NULL,
  sku           TEXT NOT NULL,
  lista         TEXT NOT NULL DEFAULT 'general',
  precio_unidad NUMERIC CHECK (precio_unidad IS NULL OR precio_unidad >= 0),
  precio_caja   NUMERIC CHECK (precio_caja   IS NULL OR precio_caja   >= 0),
  precio_kilo   NUMERIC CHECK (precio_kilo   IS NULL OR precio_kilo   >= 0),
  vigente_desde DATE NOT NULL DEFAULT current_date,
  lote_id       UUID,
  origen        TEXT NOT NULL DEFAULT 'archivo'
                CHECK (origen IN ('archivo','dashboard')),
  PRIMARY KEY (tenant_id, sku, lista, vigente_desde),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE,
  CONSTRAINT precio_al_menos_uno
    CHECK (COALESCE(precio_unidad, precio_caja, precio_kilo) IS NOT NULL)
);

COMMENT ON TABLE core.precio IS
  'Historizado por vigente_desde: el precio de hoy no reescribe el que
   se usó en una venta de marzo. El catálogo lee el vigente.';

CREATE TABLE IF NOT EXISTS core.costo (
  tenant_id      UUID NOT NULL,
  sku            TEXT NOT NULL,
  costo_unitario NUMERIC NOT NULL CHECK (costo_unitario >= 0),
  vigente_desde  DATE NOT NULL DEFAULT current_date,
  origen         TEXT NOT NULL DEFAULT 'lista'
                 CHECK (origen IN ('ventas','lista')),
  lote_id        UUID,
  PRIMARY KEY (tenant_id, sku, vigente_desde),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);

COMMENT ON TABLE core.costo IS
  'D-04 · El costo puede venir en la línea de venta o en una lista
   aparte. tenants.config->>fuente_costo declara cuál. Si es "ninguno",
   margen y ventas-bajo-costo se muestran como NO DISPONIBLE en el
   dashboard: nunca como cero, que se lee como un dato real.';

CREATE TABLE IF NOT EXISTS core.stock (
  tenant_id      UUID NOT NULL,
  sku            TEXT NOT NULL,
  almacen        TEXT NOT NULL DEFAULT 'principal',
  stock_total    NUMERIC NOT NULL DEFAULT 0,
  stock_cajas    NUMERIC,
  fecha_venc     DATE,
  es_foco_mes    BOOLEAN NOT NULL DEFAULT FALSE,
  lote_id        UUID,
  campos_manuales TEXT[] NOT NULL DEFAULT '{}',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sku, almacen),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);


-- ███ 007_core_ventas.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 007 · VENTAS · el corazón del sistema
--
-- Tres correcciones respecto de la 15.3, todas medidas contra datos
-- reales:
--   D-05  regla de elegibilidad INVERTIDA (la directa dejaba fuera
--         el 97,4% de la venta facturada)
--   D-06  las notas de crédito RESTAN (1.995 líneas sumaban positivo:
--         ~19% de sobreestimación) y una fila con FA y NC produce DOS
--         hechos (458 filas en KeyFoods)
--   §5.2  tipo_doc y estado_pedido son columnas de primer nivel. En la
--         15.3 el ciclo las leía y nunca las escribía: no llegaban.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.venta_linea (
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  linea_id       TEXT NOT NULL,
  cliente_key    TEXT NOT NULL,
  fecha          DATE NOT NULL,
  sku            TEXT NOT NULL,
  tipo_doc       TEXT NOT NULL,
  documento      TEXT,
  estado_pedido  TEXT,
  cantidad       NUMERIC NOT NULL,
  monto_neto     NUMERIC NOT NULL,     -- YA viene con signo aplicado (D-06)
  costo_unitario NUMERIC,              -- snapshot si fuente_costo = 'ventas'
  vendedor_origen TEXT,                -- SÓLO auditoría. La maestra manda.
  lote_id        UUID NOT NULL,        -- linaje (D-12)
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, linea_id)
);

COMMENT ON COLUMN core.venta_linea.linea_id IS
  'sha256(tenant|cliente|fecha|tipo_doc|documento|sku|monto).
   INCLUYE tipo_doc: sin eso, la factura y la nota de crédito de la
   misma fila colisionan en la misma llave y una pisa a la otra.';

COMMENT ON COLUMN core.venta_linea.monto_neto IS
  'Neto CON SIGNO. Una NC entra negativa. Sumar esta columna da la
   venta neta directamente, sin que cada consulta tenga que acordarse.';

CREATE INDEX IF NOT EXISTS ix_venta_cliente_fecha
  ON core.venta_linea (tenant_id, cliente_key, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_venta_sku_fecha
  ON core.venta_linea (tenant_id, sku, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_venta_fecha
  ON core.venta_linea (tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_venta_lote
  ON core.venta_linea (lote_id);

-- ─── La regla de elegibilidad, en un solo lugar ────────────────────
-- Cualquier consumidor (ETL, app, reporte) la llama. Nadie la
-- reescribe. Si cambia, cambia acá.

CREATE OR REPLACE FUNCTION core.venta_elegible(
  p_tenant   UUID,
  p_tipo_doc TEXT,
  p_estado   TEXT
) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS $$
  SELECT EXISTS (
           SELECT 1 FROM core.tipo_documento td
            WHERE td.tenant_id = p_tenant
              AND td.codigo = upper(trim(p_tipo_doc))
              AND td.cuenta_como_venta
         )
     AND NOT EXISTS (
           SELECT 1 FROM core.estado_excluido ee
            WHERE ee.tenant_id = p_tenant
              AND ee.estado = upper(trim(COALESCE(p_estado, '')))
         );
$$;

COMMENT ON FUNCTION core.venta_elegible(UUID, TEXT, TEXT) IS
  'D-05 · INCLUIR todo documento reconocido SALVO estado excluido.
   Un estado vacío NO excluye: en la fuente real viene vacío el 74%
   de las veces y no significa que la venta no exista.';

CREATE OR REPLACE FUNCTION core.signo_documento(p_tenant UUID, p_tipo_doc TEXT)
RETURNS SMALLINT
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS $$
  SELECT COALESCE(
    (SELECT td.signo FROM core.tipo_documento td
      WHERE td.tenant_id = p_tenant AND td.codigo = upper(trim(p_tipo_doc))),
    1::smallint
  );
$$;

-- ─── Metas y focos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.meta (
  tenant_id    UUID NOT NULL,
  ejecutivo_id TEXT NOT NULL,
  mes          DATE NOT NULL,          -- primer día del mes
  monto        NUMERIC NOT NULL CHECK (monto >= 0),
  PRIMARY KEY (tenant_id, ejecutivo_id, mes),
  FOREIGN KEY (tenant_id, ejecutivo_id) REFERENCES core.ejecutivo(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core.foco (
  tenant_id UUID NOT NULL,
  mes       DATE NOT NULL,
  sku       TEXT NOT NULL,
  zona_id   TEXT NOT NULL DEFAULT '*',   -- '*' = todas las zonas
  meta_unidades NUMERIC,
  PRIMARY KEY (tenant_id, mes, sku, zona_id),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);


-- ═══════════════════════════════════════════════════════════════════
-- PRECIO POR CLIENTE · lo que de verdad paga cada uno
--
-- LA REGLA DE NEGOCIO
-- La lista de precios dice cuánto vale un producto. El histórico dice
-- cuánto le cobras TÚ a ESE cliente. No son lo mismo: en foodservice
-- casi ningún cliente grande paga lista.
--
-- Si el SKU1 está en $1.000 y a este cliente se lo vendes a $800, su
-- catálogo tiene que decir $800. Mandarle $1.000 es una llamada de
-- reclamo o, peor, una venta perdida.
--
-- ORDEN DE PRECEDENCIA
--   1. Precio acordado a mano (core.precio_cliente) — gerencia lo fijó
--   2. Último precio realmente cobrado (histórico de venta)
--   3. Lista de precios
--
-- El histórico manda sobre la lista, pero no ciegamente: ver la banda
-- de cordura más abajo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.precio_cliente (
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  cliente_key   TEXT NOT NULL,
  sku           TEXT NOT NULL,
  precio_unidad NUMERIC NOT NULL CHECK (precio_unidad >= 0),
  motivo        TEXT,
  vigente_desde DATE NOT NULL DEFAULT current_date,
  vigente_hasta DATE,
  creado_por    UUID REFERENCES platform.usuarios(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cliente_key, sku, vigente_desde),
  FOREIGN KEY (tenant_id, cliente_key) REFERENCES core.cliente(tenant_id, cliente_key) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, sku)         REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);

COMMENT ON TABLE core.precio_cliente IS
  'Precio ACORDADO con un cliente. Gana sobre el histórico y sobre la
   lista. Se fija desde el dashboard, con motivo y con vigencia: un
   precio especial que nadie recuerda por qué existe termina siendo un
   margen perdido que nadie puede explicar.';

CREATE INDEX IF NOT EXISTS ix_precio_cliente_vigente
  ON core.precio_cliente (tenant_id, cliente_key, sku)
  WHERE vigente_hasta IS NULL;

-- ─── Último precio realmente cobrado ───────────────────────────────
CREATE OR REPLACE FUNCTION core.precio_historico(
  p_tenant UUID, p_cliente_key TEXT, p_sku TEXT, p_meses INTEGER DEFAULT 6
) RETURNS NUMERIC
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS $$
  SELECT round(v.monto_neto / NULLIF(v.cantidad, 0))
    FROM core.venta_linea v
   WHERE v.tenant_id = p_tenant
     AND v.cliente_key = p_cliente_key
     AND v.sku = p_sku
     AND v.cantidad > 0
     -- Sólo documentos que SUMAN. Una nota de crédito tiene monto
     -- negativo: dividirla por la cantidad da un precio negativo.
     AND v.monto_neto > 0
     AND v.fecha >= (current_date - (p_meses || ' months')::interval)
   ORDER BY v.fecha DESC, v.creado_en DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION core.precio_historico(UUID, TEXT, TEXT, INTEGER) IS
  'El ÚLTIMO precio unitario cobrado, no el promedio. Un promedio de seis
   meses arrastra el precio viejo y subestima una subida reciente.';

-- ─── El precio efectivo ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.precio_para_cliente(
  p_tenant UUID, p_cliente_key TEXT, p_sku TEXT
) RETURNS TABLE (precio NUMERIC, origen TEXT, precio_lista NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, core AS $$
DECLARE v_lista NUMERIC; v_acordado NUMERIC; v_hist NUMERIC;
BEGIN
  SELECT COALESCE(p.precio_unidad, p.precio_caja, p.precio_kilo)
    INTO v_lista
    FROM core.precio p
   WHERE p.tenant_id = p_tenant AND p.sku = p_sku
     AND p.vigente_desde <= current_date
   ORDER BY p.vigente_desde DESC
   LIMIT 1;

  -- 1 · Acordado a mano
  SELECT pc.precio_unidad INTO v_acordado
    FROM core.precio_cliente pc
   WHERE pc.tenant_id = p_tenant AND pc.cliente_key = p_cliente_key
     AND pc.sku = p_sku
     AND pc.vigente_desde <= current_date
     AND (pc.vigente_hasta IS NULL OR pc.vigente_hasta >= current_date)
   ORDER BY pc.vigente_desde DESC
   LIMIT 1;

  IF v_acordado IS NOT NULL THEN
    RETURN QUERY SELECT v_acordado, 'acordado'::text, v_lista; RETURN;
  END IF;

  -- 2 · Histórico, con BANDA DE CORDURA.
  -- Un precio histórico que sale del 40%–160% de la lista casi siempre
  -- es un dato malo: una unidad de medida distinta, un combo cargado
  -- como una línea, una promoción de liquidación. Aplicarlo al catálogo
  -- sería propagar el error al cliente. Se cae a lista y el caso queda
  -- visible en api.integridad.
  v_hist := core.precio_historico(p_tenant, p_cliente_key, p_sku);
  IF v_hist IS NOT NULL AND v_lista IS NOT NULL
     AND v_hist BETWEEN v_lista * 0.4 AND v_lista * 1.6 THEN
    RETURN QUERY SELECT v_hist, 'historico'::text, v_lista; RETURN;
  END IF;
  IF v_hist IS NOT NULL AND v_lista IS NULL THEN
    RETURN QUERY SELECT v_hist, 'historico'::text, NULL::numeric; RETURN;
  END IF;

  -- 3 · Lista
  RETURN QUERY SELECT v_lista, 'lista'::text, v_lista;
END $$;

COMMENT ON FUNCTION core.precio_para_cliente(UUID, TEXT, TEXT) IS
  'UN solo lugar decide qué paga un cliente. Lo usan el catálogo, el
   pedido del vendedor y el pedido público. Si estuviera duplicado, el
   catálogo diría $800 y el pedido cobraría $1.000.';


-- ███ 008_core_field_ops.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 008 · OPERACIÓN EN TERRENO
--
-- D-13 · Todo lo que nace en el teléfono lleva client_op_id (UUID
-- generado en el dispositivo). El servidor hace ON CONFLICT DO NOTHING.
-- Reintentar diez veces produce UN registro. Sin esto, el vendedor no
-- se atreve a tocar "Reintentar" y vuelve al cuaderno.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.visita (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id  UUID NOT NULL,
  cliente_key   TEXT NOT NULL,
  ejecutivo_id  TEXT NOT NULL,
  fecha         DATE NOT NULL DEFAULT current_date,
  estado        TEXT NOT NULL DEFAULT 'planificada'
                CHECK (estado IN ('planificada','visitada','omitida')),
  resultado     TEXT,
  orden         INTEGER,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id),
  FOREIGN KEY (tenant_id, cliente_key)  REFERENCES core.cliente(tenant_id, cliente_key),
  FOREIGN KEY (tenant_id, ejecutivo_id) REFERENCES core.ejecutivo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS core.checkin (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL,
  visita_id    UUID REFERENCES core.visita(id) ON DELETE SET NULL,
  cliente_key  TEXT NOT NULL,
  ejecutivo_id TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  precision_m  NUMERIC,
  distancia_m  NUMERIC,
  verificado   BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id)
);

COMMENT ON TABLE core.checkin IS
  'DATO PERSONAL: la posición GPS de un ejecutivo es dato de una
   persona natural identificada. Retención acotada (018) y finalidad
   declarada en compliance.processing_activities.';

CREATE TABLE IF NOT EXISTS core.nota_cliente (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL,
  cliente_key  TEXT NOT NULL,
  ejecutivo_id TEXT NOT NULL,
  texto        TEXT NOT NULL,
  anonimizado_en TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id)
);

COMMENT ON TABLE core.nota_cliente IS
  'Texto libre escrito por una persona sobre otra persona: se trata
   como dato personal aunque el cliente sea empresa.';

CREATE TABLE IF NOT EXISTS core.pedido (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id   UUID NOT NULL,
  cliente_key    TEXT NOT NULL,
  ejecutivo_id   TEXT,
  origen         TEXT NOT NULL DEFAULT 'app'
                 CHECK (origen IN ('app','catalogo_publico','portal')),
  estado         TEXT NOT NULL DEFAULT 'recibido'
                 CHECK (estado IN ('recibido','confirmado','despachado','anulado')),
  lineas         JSONB NOT NULL,
  nota           TEXT,
  total_estimado NUMERIC NOT NULL DEFAULT 0,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id),
  FOREIGN KEY (tenant_id, cliente_key) REFERENCES core.cliente(tenant_id, cliente_key)
);

COMMENT ON COLUMN core.pedido.total_estimado IS
  'ESTIMADO. El precio se revalida SIEMPRE en el servidor: lo que
   manda el cliente es una intención, no un dato.';

CREATE INDEX IF NOT EXISTS ix_pedido_cliente
  ON core.pedido (tenant_id, cliente_key, creado_en DESC);

CREATE TABLE IF NOT EXISTS core.encuesta_visita (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL,
  visita_id    UUID REFERENCES core.visita(id) ON DELETE CASCADE,
  respuestas   JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id)
);


-- ███ 009_core_catalogo.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 009 · CATÁLOGO PARA EL CLIENTE
--
-- D-09 · El token ES una credencial. Se guarda SOLO el hash.
-- En la 15.3 se guardaba en texto plano y se comparaba con
-- `WHERE token = trim(p_token)`: una copia de la base era una copia de
-- todas las credenciales, sin expiración ni revocación.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.oferta_cliente (
  tenant_id   UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  cliente_key TEXT NOT NULL,
  skus        TEXT[] NOT NULL DEFAULT '{}',
  motivo      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- por qué se sugiere (D-12)
  regla_version TEXT,                              -- decisión automatizada
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cliente_key),
  FOREIGN KEY (tenant_id, cliente_key) REFERENCES core.cliente(tenant_id, cliente_key) ON DELETE CASCADE
);

COMMENT ON COLUMN core.oferta_cliente.activo IS
  'UNA sola columna, y se llama `activo`. En la 15.3 convivieron
   `activo` y `activa` según qué script se hubiera corrido último, y
   eso producía el falso "link inválido o catálogo no disponible".';

CREATE TABLE IF NOT EXISTS core.catalog_token (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  cliente_key   TEXT NOT NULL,
  creado_por    UUID REFERENCES platform.usuarios(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revocado_en   TIMESTAMPTZ,
  ultimo_acceso TIMESTAMPTZ,
  accesos       BIGINT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, token_hash)
);

CREATE INDEX IF NOT EXISTS ix_catalog_token_vivo
  ON core.catalog_token (token_hash)
  WHERE revocado_en IS NULL;

CREATE TABLE IF NOT EXISTS core.rate_limit (
  bucket_key   TEXT NOT NULL,
  ventana      TIMESTAMPTZ NOT NULL,
  intentos     INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  PRIMARY KEY (bucket_key, ventana)
);


-- ███ 010_ingest_plane.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 010 · PLANO DE INGESTA · evidencia y linaje
--
-- D-04 · Lo crudo es inmutable, lo canónico es publicado.
-- Cada cifra del dashboard se puede rastrear hasta la fila del Excel
-- que la produjo. Una fila excluida NO desaparece: queda con motivo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingest.archivo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('precios','stock','maestra','ventas','costos')),
  nombre_original TEXT NOT NULL,
  sha256         TEXT NOT NULL,
  bytes          BIGINT,
  storage_path   TEXT,
  subido_por     UUID REFERENCES platform.usuarios(id),
  subido_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_archivo_hash ON ingest.archivo (tenant_id, sha256);

COMMENT ON COLUMN ingest.archivo.sha256 IS
  'Detecta la recarga del mismo archivo antes de procesarlo. Los dos
   archivos de venta de KeyFoods se solapaban en 99,99%: sin esto, la
   venta se duplica y nadie se entera hasta que el total no cuadra.';

CREATE TABLE IF NOT EXISTS ingest.lote (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  archivo_id      UUID NOT NULL REFERENCES ingest.archivo(id) ON DELETE CASCADE,
  estado          TEXT NOT NULL DEFAULT 'recibido'
                  CHECK (estado IN ('recibido','normalizado','validado','publicado','rechazado')),
  filas_leidas    INTEGER NOT NULL DEFAULT 0,
  filas_validas   INTEGER NOT NULL DEFAULT 0,
  filas_excluidas INTEGER NOT NULL DEFAULT 0,
  motivo_rechazo  TEXT,
  iniciado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_en    TIMESTAMPTZ,
  publicado_por   UUID REFERENCES platform.usuarios(id)
);

CREATE TABLE IF NOT EXISTS ingest.fila_cruda (
  lote_id  UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  nro_fila INTEGER NOT NULL,
  datos    JSONB NOT NULL,
  PRIMARY KEY (lote_id, nro_fila)
);

COMMENT ON TABLE ingest.fila_cruda IS
  'INMUTABLE. Tal cual venía el archivo, sin interpretar. Es la
   evidencia. Nunca se corrige acá: se corrige el origen y se recarga.';

CREATE TABLE IF NOT EXISTS ingest.fila_norm (
  lote_id       UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  nro_fila      INTEGER NOT NULL,
  datos         JSONB NOT NULL,
  mapeo_version TEXT NOT NULL DEFAULT 'contrato-v3',
  PRIMARY KEY (lote_id, nro_fila)
);

CREATE TABLE IF NOT EXISTS ingest.exclusion (
  lote_id  UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  nro_fila INTEGER NOT NULL,
  regla    TEXT NOT NULL,
  detalle  TEXT,
  PRIMARY KEY (lote_id, nro_fila, regla)
);

COMMENT ON TABLE ingest.exclusion IS
  'Reglas: TIPO_DOC_DESCONOCIDO · ESTADO_EXCLUIDO · CLIENTE_SIN_MAESTRA
   · SKU_SIN_PRECIO · FECHA_FUTURA · DUPLICADO_EN_LOTE · MONTO_INVALIDO.
   Nada se borra en silencio: si falta plata en el reporte, está acá.';

CREATE TABLE IF NOT EXISTS ingest.reconciliacion (
  lote_id          UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  metrica          TEXT NOT NULL,
  valor_calculado  NUMERIC NOT NULL,
  valor_oficial    NUMERIC,
  diferencia_pct   NUMERIC,
  aprobado_por     UUID REFERENCES platform.usuarios(id),
  aprobado_en      TIMESTAMPTZ,
  PRIMARY KEY (lote_id, metrica)
);

COMMENT ON TABLE ingest.reconciliacion IS
  'La COMPUERTA. Si la diferencia supera el umbral, el lote queda
   RECHAZADO y no se publica. La app nunca arregla una cifra borrando
   datos: se bloquea, se diagnostica, se corrige el origen y se vuelve
   a correr de forma idempotente.';


-- ███ 011_read_models.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 011 · READ MODELS · lo que consumen las pantallas
--
-- D-07 · Los cálculos viven acá, no en el cliente.
-- En la 15.3, Gerencia.jsx tenía 2.360 líneas y Ruta.jsx 1.942 porque
-- calculaban sobre tablas crudas traídas con select('*'). La misma
-- métrica se calculaba distinto en dos pantallas.
--
-- Todas las vistas usan security_invoker = true: la RLS que se aplica
-- es la DEL QUE CONSULTA, no la del dueño de la vista. Sin esto una
-- vista sería un túnel por debajo del aislamiento entre empresas.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Definición ÚNICA del estado de un cliente ─────────────────────
CREATE OR REPLACE FUNCTION core.estado_cliente(
  p_dias_sin_comprar INTEGER,
  p_bloqueado BOOLEAN
) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_bloqueado                THEN 'bloqueado'
    WHEN p_dias_sin_comprar IS NULL THEN 'nunca_compro'
    WHEN p_dias_sin_comprar <=  30  THEN 'activo'
    WHEN p_dias_sin_comprar <=  60  THEN 'enfriandose'
    WHEN p_dias_sin_comprar <=  90  THEN 'en_riesgo'
    WHEN p_dias_sin_comprar <= 180  THEN 'dormido'
    ELSE 'fugado'
  END;
$$;

-- ─── Métricas por cliente ──────────────────────────────────────────
CREATE OR REPLACE VIEW core.v_cliente_metricas
WITH (security_invoker = true) AS
WITH v AS (
  SELECT tenant_id, cliente_key,
         max(fecha)                                              AS ultima_compra,
         sum(monto_neto) FILTER (
           WHERE fecha >= date_trunc('month', current_date)::date) AS venta_mtd,
         sum(monto_neto) FILTER (
           WHERE fecha >= (date_trunc('month', current_date) - interval '3 months')::date
             AND fecha <   date_trunc('month', current_date)::date) / 3.0 AS promedio_3m,
         count(DISTINCT sku) FILTER (
           WHERE fecha >= (current_date - 90))                   AS skus_90d
    FROM core.venta_linea
   GROUP BY tenant_id, cliente_key
)
SELECT c.tenant_id, c.cliente_key, c.nombre, c.comuna, c.direccion,
       c.lat, c.lng, c.rubro, c.zona_id, c.ejecutivo_id,
       c.es_bloqueado, c.es_persona_natural,
       v.ultima_compra,
       (current_date - v.ultima_compra)::int                     AS dias_sin_comprar,
       COALESCE(v.venta_mtd, 0)                                  AS venta_mtd,
       COALESCE(v.promedio_3m, 0)                                AS promedio_3m,
       COALESCE(v.skus_90d, 0)                                   AS skus_90d,
       COALESCE(v.venta_mtd, 0) - COALESCE(v.promedio_3m, 0)     AS brecha,
       core.estado_cliente((current_date - v.ultima_compra)::int, c.es_bloqueado) AS estado
  FROM core.cliente c
  LEFT JOIN v ON v.tenant_id = c.tenant_id AND v.cliente_key = c.cliente_key
 WHERE c.activo;

-- ─── CARTERA ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.cartera
WITH (security_invoker = true) AS
SELECT tenant_id, cliente_key, nombre, comuna, direccion, lat, lng, rubro,
       zona_id, ejecutivo_id, estado, es_bloqueado,
       ultima_compra, dias_sin_comprar, venta_mtd, promedio_3m, brecha, skus_90d
  FROM core.v_cliente_metricas;

-- ─── STOCK VENDIBLE ────────────────────────────────────────────────
-- Vendible = tiene precio Y stock > 0. Un SKU con stock y sin precio
-- es operativo, no vendible: sale marcado, no se esconde.
CREATE OR REPLACE VIEW api.stock_vendible
WITH (security_invoker = true) AS
SELECT p.tenant_id, p.sku, p.nombre, p.categoria, p.familia, p.marca,
       p.unidad_venta, p.imagen_url,
       COALESCE(s.stock_total, 0)  AS stock_total,
       s.stock_cajas, s.fecha_venc, COALESCE(s.es_foco_mes, false) AS es_foco_mes,
       pr.precio_unidad, pr.precio_caja, pr.precio_kilo,
       (pr.sku IS NOT NULL AND COALESCE(s.stock_total, 0) > 0) AS es_vendible,
       CASE WHEN pr.sku IS NULL THEN 'SIN_PRECIO_LISTA'
            WHEN COALESCE(s.stock_total, 0) <= 0 THEN 'SIN_STOCK'
            ELSE 'OK' END AS motivo_no_vendible
  FROM core.producto p
  LEFT JOIN LATERAL (
        SELECT * FROM core.stock s2
         WHERE s2.tenant_id = p.tenant_id AND s2.sku = p.sku
         ORDER BY s2.actualizado_en DESC LIMIT 1) s ON true
  LEFT JOIN LATERAL (
        SELECT * FROM core.precio p2
         WHERE p2.tenant_id = p.tenant_id AND p2.sku = p.sku
           AND p2.vigente_desde <= current_date
         ORDER BY p2.vigente_desde DESC LIMIT 1) pr ON true
 WHERE p.activo;

-- ─── MI DÍA ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.mi_dia
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.ejecutivo_id,
       sum(m.venta_mtd)                                          AS venta_mtd,
       max(mt.monto)                                             AS meta_mes,
       CASE WHEN max(mt.monto) > 0
            THEN round(100 * sum(m.venta_mtd) / max(mt.monto), 1) END AS avance_pct,
       count(*) FILTER (WHERE m.estado = 'activo')               AS clientes_activos,
       count(*)                                                  AS clientes_cartera,
       count(*) FILTER (WHERE m.brecha < 0)                      AS clientes_cayendo,
       sum(m.brecha) FILTER (WHERE m.brecha < 0)                 AS brecha_cartera
  FROM core.v_cliente_metricas m
  LEFT JOIN core.meta mt
         ON mt.tenant_id = m.tenant_id
        AND mt.ejecutivo_id = m.ejecutivo_id
        AND mt.mes = date_trunc('month', current_date)::date
 GROUP BY m.tenant_id, m.ejecutivo_id;

-- ─── A QUIÉN LLAMAR HOY ────────────────────────────────────────────
CREATE OR REPLACE VIEW api.llamar_hoy
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.ejecutivo_id, m.cliente_key, m.nombre,
       m.dias_sin_comprar, m.promedio_3m, m.venta_mtd, m.brecha, m.estado
  FROM core.v_cliente_metricas m
 WHERE NOT m.es_bloqueado
   AND m.estado IN ('enfriandose','en_riesgo','dormido')
 ORDER BY m.promedio_3m DESC NULLS LAST;

-- ─── RUTA DEL DÍA ──────────────────────────────────────────────────
-- Sólo clientes ubicables. Los que no tienen coordenadas NO se
-- esconden: salen en api.integridad para que alguien los corrija.
CREATE OR REPLACE VIEW api.ruta_dia
WITH (security_invoker = true) AS
SELECT v.tenant_id, v.id AS visita_id, v.orden, v.estado AS estado_visita,
       v.ejecutivo_id, v.fecha,
       m.cliente_key, m.nombre, m.comuna, m.direccion, m.lat, m.lng,
       m.estado AS estado_cliente, m.promedio_3m,
       o.skus AS oferta_skus
  FROM core.visita v
  JOIN core.v_cliente_metricas m
    ON m.tenant_id = v.tenant_id AND m.cliente_key = v.cliente_key
  LEFT JOIN core.oferta_cliente o
    ON o.tenant_id = v.tenant_id AND o.cliente_key = v.cliente_key AND o.activo
 WHERE v.fecha = current_date
   AND m.lat IS NOT NULL AND m.lng IS NOT NULL;

-- ─── GERENCIA ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.gerencia_zona
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.zona_id,
       sum(m.venta_mtd)                            AS venta_mtd,
       count(*)                                    AS clientes,
       count(*) FILTER (WHERE m.estado = 'activo') AS activos,
       count(*) FILTER (WHERE m.estado IN ('dormido','fugado')) AS dormidos,
       count(*) FILTER (WHERE m.brecha < 0)        AS cayendo,
       CASE WHEN count(*) > 0
            THEN round(100.0 * count(*) FILTER (WHERE m.estado='activo') / count(*), 1)
       END                                         AS cobertura_pct
  FROM core.v_cliente_metricas m
 GROUP BY m.tenant_id, m.zona_id;

CREATE OR REPLACE VIEW api.gerencia_ejecutivo
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.ejecutivo_id, e.nombre AS ejecutivo, e.zona_id,
       sum(m.venta_mtd)                                         AS venta_mtd,
       max(mt.monto)                                            AS meta_mes,
       count(*) FILTER (WHERE m.estado = 'activo')              AS activos,
       count(*) FILTER (WHERE m.brecha < 0)                     AS cayendo,
       count(*) FILTER (WHERE m.estado IN ('dormido','fugado')) AS dormidos
  FROM core.v_cliente_metricas m
  JOIN core.ejecutivo e
    ON e.tenant_id = m.tenant_id AND e.id = m.ejecutivo_id
  LEFT JOIN core.meta mt
    ON mt.tenant_id = m.tenant_id AND mt.ejecutivo_id = m.ejecutivo_id
   AND mt.mes = date_trunc('month', current_date)::date
 GROUP BY m.tenant_id, m.ejecutivo_id, e.nombre, e.zona_id;

-- MIX corregido: el denominador es la venta del MES, no la de la línea.
-- En la 15.3 promClp se calculaba por línea de factura y el mix salía inflado.
CREATE OR REPLACE VIEW api.gerencia_producto
WITH (security_invoker = true) AS
WITH mes AS (
  SELECT tenant_id, sku,
         sum(monto_neto) AS venta_sku,
         sum(cantidad)   AS unidades,
         sum(CASE WHEN costo_unitario IS NOT NULL
                  THEN monto_neto - (costo_unitario * cantidad) END) AS margen
    FROM core.venta_linea
   WHERE fecha >= date_trunc('month', current_date)::date
   GROUP BY tenant_id, sku
), total AS (
  SELECT tenant_id, sum(venta_sku) AS venta_mes FROM mes GROUP BY tenant_id
)
SELECT m.tenant_id, m.sku, p.nombre, p.categoria,
       m.venta_sku, m.unidades, m.margen,
       CASE WHEN t.venta_mes <> 0
            THEN round(100 * m.venta_sku / t.venta_mes, 2) END AS mix_pct
  FROM mes m
  JOIN total t ON t.tenant_id = m.tenant_id
  LEFT JOIN core.producto p ON p.tenant_id = m.tenant_id AND p.sku = m.sku;

-- ─── PRECIO POR CLIENTE ────────────────────────────────────────────
-- Lo que el vendedor ve al tomar un pedido y lo que el cliente ve en su
-- catálogo. Muestra los tres números a la vez: lo que paga, lo que dice
-- la lista y de dónde salió. Sin eso, un precio distinto al de la lista
-- parece un error del sistema.
CREATE OR REPLACE FUNCTION api.precios_cliente(p_cliente_key TEXT)
RETURNS TABLE (
  sku TEXT, nombre TEXT, categoria TEXT, precio NUMERIC, origen TEXT,
  precio_lista NUMERIC, descuento_pct NUMERIC, hay_stock BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, api, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT sv.sku, sv.nombre, sv.categoria,
         pp.precio, pp.origen, pp.precio_lista,
         CASE WHEN pp.precio_lista > 0 AND pp.precio IS NOT NULL
              THEN round(100 * (pp.precio_lista - pp.precio) / pp.precio_lista, 1) END,
         sv.stock_total > 0
    FROM api.stock_vendible sv
    CROSS JOIN LATERAL core.precio_para_cliente(v_tenant, p_cliente_key, sv.sku) pp
   WHERE sv.tenant_id = v_tenant AND sv.es_vendible
   ORDER BY sv.nombre;
END $$;

REVOKE ALL ON FUNCTION api.precios_cliente(TEXT) FROM PUBLIC;

-- ─── INTEGRIDAD · lo que hoy nadie ve ──────────────────────────────
CREATE OR REPLACE VIEW api.integridad
WITH (security_invoker = true) AS
  SELECT c.tenant_id, 'ZONA_COMUNA_CONTRADICTORIA' AS hallazgo,
         c.cliente_key AS ref,
         c.zona_id || ' vs ' || COALESCE(c.comuna,'(sin comuna)') AS detalle
    FROM core.cliente c
    JOIN core.zona_comuna zc
      ON zc.tenant_id = c.tenant_id AND zc.comuna = c.comuna
   WHERE c.activo AND zc.zona_id IS DISTINCT FROM c.zona_id
UNION ALL
  SELECT c.tenant_id, 'CLIENTE_SIN_UBICACION', c.cliente_key,
         COALESCE(c.comuna, '(sin comuna)')
    FROM core.cliente c
   WHERE c.activo AND (c.lat IS NULL OR c.lng IS NULL)
UNION ALL
  SELECT sv.tenant_id, 'SKU_SIN_PRECIO', sv.sku, sv.nombre
    FROM api.stock_vendible sv
   WHERE sv.motivo_no_vendible = 'SIN_PRECIO_LISTA' AND sv.stock_total > 0
UNION ALL
  SELECT v.tenant_id, 'VENTA_SIN_CLIENTE_EN_MAESTRA', v.cliente_key,
         'líneas: ' || count(*)::text
    FROM core.venta_linea v
    LEFT JOIN core.cliente c
      ON c.tenant_id = v.tenant_id AND c.cliente_key = v.cliente_key
   WHERE c.cliente_key IS NULL
   GROUP BY v.tenant_id, v.cliente_key
UNION ALL
  -- Precio histórico absurdo contra la lista: unidad de medida
  -- distinta, combo cargado como una línea, o liquidación. El catálogo
  -- lo ignora y cae a lista; acá queda visible para corregirlo.
  SELECT v.tenant_id, 'PRECIO_HISTORICO_FUERA_DE_BANDA',
         v.cliente_key || ' · ' || v.sku,
         'cobrado ' || round(v.monto_neto / v.cantidad)::text ||
         ' vs lista ' || round(pr.precio)::text
    FROM core.venta_linea v
    JOIN LATERAL (
      SELECT COALESCE(p.precio_unidad, p.precio_caja, p.precio_kilo) AS precio
        FROM core.precio p
       WHERE p.tenant_id = v.tenant_id AND p.sku = v.sku
         AND p.vigente_desde <= current_date
       ORDER BY p.vigente_desde DESC LIMIT 1) pr ON pr.precio > 0
   WHERE v.cantidad > 0 AND v.monto_neto > 0
     AND v.fecha >= current_date - interval '6 months'
     AND (v.monto_neto / v.cantidad) NOT BETWEEN pr.precio * 0.4 AND pr.precio * 1.6
UNION ALL
  SELECT z.tenant_id, 'ZONA_SIN_VENTAS', z.id, z.nombre
    FROM core.zona z
   WHERE z.activo
     AND NOT EXISTS (
       SELECT 1 FROM core.cliente c
        JOIN core.venta_linea v
          ON v.tenant_id = c.tenant_id AND v.cliente_key = c.cliente_key
       WHERE c.tenant_id = z.tenant_id AND c.zona_id = z.id);


-- ███ 012_rls_foundation.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 012 · RLS FAIL-CLOSED
--
-- D-10 · ENABLE + FORCE en toda tabla con datos.
-- FORCE aplica la política también al DUEÑO de la tabla: sin eso, un
-- proceso que corra como owner cruza el límite entre empresas.
--
-- El filtro por tenant_id en la consulta es una ayuda al planificador.
-- LA BARRERA ES ESTO. Un WHERE olvidado en una consulta nueva, un job
-- de fondo o una consulta ad-hoc no pueden cruzar el límite.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tabla, n.nspname AS esquema, c.relname AS nombre
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname IN ('core','platform','ingest','compliance')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', r.tabla);
  END LOOP;
END $$;

-- ─── core: acceso por tenant, y el ejecutivo sólo ve lo suyo ───────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tabla, c.relname AS nombre
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
     WHERE c.relkind = 'r' AND n.nspname IN ('core','ingest','compliance')
       AND a.attnum > 0 AND NOT a.attisdropped
       -- cliente_contacto queda fuera A PROPÓSITO: lleva política más
       -- estricta abajo. Las políticas se combinan con OR, así que una
       -- permisiva genérica ANULARÍA la exigencia de ver_contacto.
       AND c.oid <> 'core.cliente_contacto'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_lectura  ON %s', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS tenant_escritura ON %s', r.tabla);
    EXECUTE format($f$
      CREATE POLICY tenant_lectura ON %s
        FOR SELECT USING (platform.tiene_acceso(tenant_id))
    $f$, r.tabla);
    EXECUTE format($f$
      CREATE POLICY tenant_escritura ON %s
        FOR ALL USING (platform.tiene_acceso(tenant_id))
              WITH CHECK (platform.tiene_acceso(tenant_id))
    $f$, r.tabla);
  END LOOP;
END $$;

-- Tablas de ingest sin tenant_id propio: heredan por el lote.
DROP POLICY IF EXISTS lote_lectura ON ingest.fila_cruda;
CREATE POLICY lote_lectura ON ingest.fila_cruda FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

DROP POLICY IF EXISTS lote_lectura ON ingest.fila_norm;
CREATE POLICY lote_lectura ON ingest.fila_norm FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

DROP POLICY IF EXISTS lote_lectura ON ingest.exclusion;
CREATE POLICY lote_lectura ON ingest.exclusion FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

DROP POLICY IF EXISTS lote_lectura ON ingest.reconciliacion;
CREATE POLICY lote_lectura ON ingest.reconciliacion FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

-- ─── Datos personales: además del tenant, hace falta permiso ───────
DROP POLICY IF EXISTS tenant_lectura     ON core.cliente_contacto;
DROP POLICY IF EXISTS tenant_escritura   ON core.cliente_contacto;
DROP POLICY IF EXISTS contacto_lectura   ON core.cliente_contacto;
DROP POLICY IF EXISTS contacto_escritura ON core.cliente_contacto;
CREATE POLICY contacto_lectura ON core.cliente_contacto FOR SELECT
  USING (platform.tiene_acceso(tenant_id) AND platform.puede('ver_contacto'));
CREATE POLICY contacto_escritura ON core.cliente_contacto FOR ALL
  USING (platform.tiene_acceso(tenant_id) AND platform.puede('ver_contacto'))
  WITH CHECK (platform.tiene_acceso(tenant_id) AND platform.puede('ver_contacto'));

-- ─── platform ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenants_lectura ON platform.tenants;
CREATE POLICY tenants_lectura ON platform.tenants FOR SELECT
  USING (platform.es_superadmin() OR id = platform.tenant_actual());

DROP POLICY IF EXISTS usuarios_propio ON platform.usuarios;
CREATE POLICY usuarios_propio ON platform.usuarios FOR SELECT
  USING (platform.es_superadmin() OR id = platform.usuario_actual());

DROP POLICY IF EXISTS membresias_lectura ON platform.membresias;
CREATE POLICY membresias_lectura ON platform.membresias FOR SELECT
  USING (platform.es_superadmin()
         OR usuario_id = platform.usuario_actual()
         OR (tenant_id = platform.tenant_actual()
             AND platform.puede('gestionar_usuarios')));

DROP POLICY IF EXISTS rol_permiso_lectura ON platform.rol_permiso;
CREATE POLICY rol_permiso_lectura ON platform.rol_permiso FOR SELECT USING (true);



-- ███ 013_grants.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 013 · GRANTS EXPLÍCITOS
--
-- Fail-closed: nadie puede nada hasta que se otorgue acá.
-- `anon` (sin sesión) NO toca ninguna tabla: sólo las funciones del
-- catálogo público, que validan token.
-- ═══════════════════════════════════════════════════════════════════

-- En Supabase estos roles ya existen. En local los crea db/test/00_shim.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES    IN SCHEMA core, platform, ingest, compliance, api FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core, platform, ingest, compliance, api FROM PUBLIC;

-- Sólo `api` es navegable. core/platform/ingest/compliance quedan sin USAGE:
-- una tabla nueva ahí NO es alcanzable aunque alguien olvide la política.
GRANT USAGE ON SCHEMA api TO authenticated, anon;

-- Las vistas de api son security_invoker: la RLS de las tablas de
-- abajo sigue aplicando. Por eso hace falta USAGE en core para el
-- usuario autenticado, y por eso NO se le da a anon.
GRANT USAGE ON SCHEMA core, platform TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA api TO authenticated;

GRANT SELECT ON core.cliente, core.producto, core.precio, core.stock,
                core.venta_linea, core.zona, core.zona_comuna, core.ejecutivo,
                core.meta, core.foco, core.oferta_cliente, core.visita,
                core.checkin, core.nota_cliente, core.pedido,
                core.tipo_documento, core.estado_excluido
  TO authenticated;

-- Vista intermedia de core que alimenta a varias vistas de api.
-- Es security_invoker: la RLS de las tablas de abajo sigue aplicando.
GRANT SELECT ON core.v_cliente_metricas TO authenticated;

GRANT SELECT ON core.cliente_contacto TO authenticated;   -- filtrado por RLS + permiso
GRANT SELECT ON core.costo            TO authenticated;   -- filtrado por RLS

GRANT INSERT ON core.visita, core.checkin, core.nota_cliente,
                core.pedido, core.encuesta_visita TO authenticated;
GRANT UPDATE ON core.visita, core.pedido TO authenticated;

GRANT SELECT ON platform.tenants, platform.usuarios,
                platform.membresias, platform.rol_permiso TO authenticated;

GRANT EXECUTE ON FUNCTION platform.jwt(), platform.usuario_actual(),
                          platform.tenant_actual(), platform.es_superadmin(),
                          platform.tiene_acceso(UUID), platform.puede(TEXT),
                          platform.rol_en_tenant(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION core.precio_para_cliente(UUID, TEXT, TEXT),
                          core.precio_historico(UUID, TEXT, TEXT, INTEGER)
  TO authenticated;
GRANT SELECT ON core.precio_cliente TO authenticated;

GRANT EXECUTE ON FUNCTION core.venta_elegible(UUID, TEXT, TEXT),
                          core.signo_documento(UUID, TEXT),
                          core.estado_cliente(INTEGER, BOOLEAN)
  TO authenticated;

-- Lo que se cree de acá en adelante también nace cerrado.
ALTER DEFAULT PRIVILEGES IN SCHEMA core, platform, ingest, compliance
  REVOKE ALL ON TABLES FROM PUBLIC;


-- ███ 014_api_publica.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 014 · CATÁLOGO PÚBLICO Y PEDIDO SIN SESIÓN
--
-- La única superficie que toca internet sin sesión. Se trata como tal.
--
-- UNA función por objeto, en UN archivo (regla 5 / guard R8). En la
-- 15.3 `get_public_catalogo` estaba definida en cuatro archivos y la
-- que quedaba viva era la del último script ejecutado. Nadie sabía cuál.
-- ═══════════════════════════════════════════════════════════════════

-- NOTA · pgcrypto (digest, gen_random_bytes) vive en `public` en una
-- instalación estándar y en `extensions` en Supabase. Las funciones de
-- este archivo listan AMBOS en su search_path: fijarlo es obligatorio
-- por seguridad, pero fijarlo mal deja la función rota en un entorno.
CREATE OR REPLACE FUNCTION api.hash_token(p_token TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, extensions AS $$
  SELECT encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

-- Rate limit: ventana de 1 minuto por clave (token o IP).
CREATE OR REPLACE FUNCTION api.rate_limit_ok(p_key TEXT, p_max INTEGER DEFAULT 30)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, public, extensions AS $$
DECLARE v_ventana TIMESTAMPTZ := date_trunc('minute', now());
        v_n INTEGER;
BEGIN
  INSERT INTO core.rate_limit (bucket_key, ventana, intentos)
       VALUES (p_key, v_ventana, 1)
  ON CONFLICT (bucket_key, ventana)
    DO UPDATE SET intentos = core.rate_limit.intentos + 1
  RETURNING intentos INTO v_n;
  RETURN v_n <= p_max;
END $$;

-- ─── Catálogo ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_catalogo(p_token TEXT)
RETURNS TABLE (
  sku TEXT, nombre TEXT, categoria TEXT, marca TEXT, unidad_venta TEXT,
  imagen_url TEXT, precio_unidad NUMERIC, precio_caja NUMERIC, hay_stock BOOLEAN
)
-- VOLATILE (no STABLE): registra el acceso al token. Un catálogo que
-- no deja rastro de quién lo abrió no sirve como evidencia.
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, api, public, extensions AS $$
DECLARE v_hash TEXT; v_tok core.catalog_token%ROWTYPE;
BEGIN
  -- Validación de formato ANTES de tocar la base.
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 20 AND 128
     OR p_token !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  IF NOT api.rate_limit_ok('cat:' || left(p_token, 12)) THEN
    RAISE EXCEPTION 'demasiados_intentos' USING ERRCODE = '53400';
  END IF;

  v_hash := api.hash_token(p_token);

  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = v_hash
     AND t.revocado_en IS NULL
     AND t.expira_en > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  UPDATE core.catalog_token
     SET ultimo_acceso = now(), accesos = accesos + 1
   WHERE id = v_tok.id;

  -- EL PRECIO QUE VE EL CLIENTE ES **SU** PRECIO.
  -- Si tiene negociado $800 sobre una lista de $1.000, acá dice $800.
  -- Mandarle la lista es una llamada de reclamo o una venta perdida.
  -- El SKU sin historial ni acuerdo sale a lista, que es lo correcto.
  RETURN QUERY
  SELECT sv.sku, sv.nombre, sv.categoria, sv.marca, sv.unidad_venta,
         sv.imagen_url,
         pp.precio,
         CASE WHEN sv.precio_caja IS NOT NULL AND sv.precio_unidad > 0
              THEN round(pp.precio * sv.precio_caja / sv.precio_unidad) END,
         sv.stock_total > 0
    FROM core.oferta_cliente o
    CROSS JOIN LATERAL unnest(o.skus) AS s(sku)
    JOIN api.stock_vendible sv
      ON sv.tenant_id = o.tenant_id AND sv.sku = s.sku
    CROSS JOIN LATERAL core.precio_para_cliente(v_tok.tenant_id, v_tok.cliente_key, sv.sku) pp
   WHERE o.tenant_id = v_tok.tenant_id
     AND o.cliente_key = v_tok.cliente_key
     AND o.activo
     AND sv.es_vendible
     AND pp.precio IS NOT NULL;
END $$;

COMMENT ON FUNCTION api.get_catalogo(TEXT) IS
  'Devuelve SÓLO productos publicados para ese cliente. El token nunca
   alcanza para leer nada más: ni cartera, ni precios de otros, ni
   datos de contacto.';

-- ─── Pedido público ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.crear_pedido_publico(
  p_token  TEXT,
  p_lineas JSONB,
  p_nota   TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, api, public, extensions AS $$
DECLARE v_hash TEXT; v_tok core.catalog_token%ROWTYPE;
        v_total NUMERIC := 0; v_id UUID; v_op UUID := COALESCE(p_client_op_id, gen_random_uuid());
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,128}$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;
  IF NOT api.rate_limit_ok('ped:' || left(p_token, 12), 10) THEN
    RAISE EXCEPTION 'demasiados_intentos' USING ERRCODE = '53400';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'pedido_vacio' USING ERRCODE = '22023';
  END IF;

  v_hash := api.hash_token(p_token);
  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = v_hash AND t.revocado_en IS NULL AND t.expira_en > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  -- El precio se recalcula SIEMPRE en el servidor: lo que manda el
  -- cliente es una intención, no un dato.
  -- MISMA función que usó el catálogo: si mostró $800, cobra $800.
  -- Duplicar el cálculo es cómo se llega a un pedido que no cuadra con
  -- lo que el cliente vio en pantalla.
  SELECT COALESCE(sum((l->>'cantidad')::numeric * COALESCE(pp.precio, 0)), 0)
    INTO v_total
    FROM jsonb_array_elements(p_lineas) l
    CROSS JOIN LATERAL core.precio_para_cliente(
      v_tok.tenant_id, v_tok.cliente_key, l->>'sku') pp;

  INSERT INTO core.pedido (tenant_id, client_op_id, cliente_key, origen,
                           lineas, nota, total_estimado)
       VALUES (v_tok.tenant_id, v_op, v_tok.cliente_key, 'catalogo_publico',
               p_lineas, p_nota, v_total)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN                       -- idempotencia (D-13)
    SELECT id INTO v_id FROM core.pedido
     WHERE tenant_id = v_tok.tenant_id AND client_op_id = v_op;
  END IF;

  RETURN v_id;
END $$;

-- ─── Emisión y revocación de tokens (con sesión) ───────────────────
CREATE OR REPLACE FUNCTION api.emitir_token_catalogo(p_cliente_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform, api, public, extensions AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_token TEXT;
BEGIN
  IF NOT platform.puede('emitir_catalogo') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  v_token := replace(replace(encode(gen_random_bytes(32),'base64'),'+','-'),'/','_');
  v_token := replace(v_token, '=', '');

  INSERT INTO core.catalog_token (tenant_id, token_hash, cliente_key, creado_por)
       VALUES (v_tenant, api.hash_token(v_token), p_cliente_key, platform.usuario_actual());

  RETURN v_token;   -- se muestra UNA vez. Después sólo existe el hash.
END $$;

CREATE OR REPLACE FUNCTION api.revocar_token_catalogo(p_token_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform, public, extensions AS $$
BEGIN
  IF NOT platform.puede('emitir_catalogo') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE core.catalog_token SET revocado_en = now()
   WHERE id = p_token_id AND tenant_id = platform.tenant_actual();
END $$;

REVOKE ALL ON FUNCTION api.get_catalogo(TEXT)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION api.crear_pedido_publico(TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.emitir_token_catalogo(TEXT)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION api.revocar_token_catalogo(UUID)                FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rate_limit_ok(TEXT, INTEGER)                FROM PUBLIC;
REVOKE ALL ON FUNCTION api.hash_token(TEXT)                            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.get_catalogo(TEXT)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.crear_pedido_publico(TEXT, JSONB, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.emitir_token_catalogo(TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION api.revocar_token_catalogo(UUID)               TO authenticated;


-- ███ 015_audit.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 015 · AUDITORÍA
-- Ley 21.719: toda operación sensible deja evidencia.
-- Sirve además para la pregunta más común de soporte: "¿quién cambió esto?"
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.auditoria (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID,
  actor_id   UUID,
  accion     TEXT NOT NULL,          -- INSERT | UPDATE | DELETE | LOGIN | EXPORT…
  objeto     TEXT NOT NULL,          -- 'core.cliente'
  objeto_id  TEXT,
  antes      JSONB,
  despues    JSONB,
  ip         INET,
  user_agent TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_auditoria_tenant ON platform.auditoria (tenant_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_objeto ON platform.auditoria (objeto, objeto_id);

ALTER TABLE platform.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.auditoria FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditoria_lectura ON platform.auditoria;
CREATE POLICY auditoria_lectura ON platform.auditoria FOR SELECT
  USING (platform.es_superadmin()
         OR (tenant_id = platform.tenant_actual()
             AND platform.puede('gestionar_usuarios')));

-- La auditoría NO se edita ni se borra: no hay política para UPDATE ni
-- DELETE, así que RLS los rechaza. Una bitácora modificable no es una
-- bitácora.

CREATE OR REPLACE FUNCTION platform.fn_auditar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_tenant UUID;
BEGIN
  BEGIN
    v_tenant := COALESCE(
      (to_jsonb(COALESCE(NEW, OLD)) ->> 'tenant_id')::uuid,
      platform.tenant_actual());
  EXCEPTION WHEN others THEN v_tenant := platform.tenant_actual();
  END;

  INSERT INTO platform.auditoria (tenant_id, actor_id, accion, objeto, antes, despues)
  VALUES (v_tenant, platform.usuario_actual(), TG_OP,
          TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION platform.fn_auditar() FROM PUBLIC;

-- Se audita lo sensible, no todo: auditar venta_linea (millones de
-- filas por carga) sólo hace crecer la base sin aportar nada. El
-- linaje de las ventas ya lo da ingest.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'core.cliente','core.ejecutivo','core.zona','core.zona_comuna',
    'core.meta','core.foco','core.precio','core.tipo_documento',
    'core.estado_excluido','core.catalog_token','core.cliente_contacto',
    'platform.membresias','platform.tenants'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auditar ON %s', r);
    EXECUTE format(
      'CREATE TRIGGER tg_auditar AFTER INSERT OR UPDATE OR DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION platform.fn_auditar()', r);
  END LOOP;
END $$;


-- ███ 016_privacy_compliance.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 016 · PRIVACIDAD Y CUMPLIMIENTO · Ley 21.719
--
-- Adaptado del paquete APP2_LEGAL_SECURITY_BASE_V1 (011) con dos
-- correcciones obligatorias:
--   1. tenant_id UUID contra platform.tenants — el original apuntaba a
--      public.tenants(id), que en la 15.3 es TEXT: fallaba al primer RUN
--   2. movido de `public` al esquema `compliance` (D-03)
--
-- Que estas tablas existan NO significa tener un programa de
-- cumplimiento. Son el plano de control técnico. Falta lo de la
-- sección 12 del documento de arquitectura: DPA, política de
-- privacidad, responsable designado y revisión de abogado.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance.actividad_tratamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  finalidad TEXT NOT NULL,
  base_legitimidad TEXT NOT NULL CHECK (base_legitimidad IN
    ('consentimiento','contrato','obligacion_legal','interes_legitimo',
     'reclamacion_legal','otra')),
  categorias_datos TEXT[] NOT NULL DEFAULT '{}',
  categorias_titulares TEXT[] NOT NULL DEFAULT '{}',
  destinatarios TEXT[] NOT NULL DEFAULT '{}',
  transferencia_internacional BOOLEAN NOT NULL DEFAULT FALSE,
  politica_retencion TEXT,
  decision_automatizada BOOLEAN NOT NULL DEFAULT FALSE,
  logica_resumen TEXT,
  revision_humana BOOLEAN NOT NULL DEFAULT FALSE,
  politica_privacidad_version TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

COMMENT ON TABLE compliance.actividad_tratamiento IS
  'Registro de actividades. Cada tratamiento declara SU base de
   legitimidad. No se fuerza consentimiento donde el sustento correcto
   es contrato, obligación legal o interés legítimo.';

CREATE TABLE IF NOT EXISTS compliance.consentimiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  actividad_id UUID NOT NULL REFERENCES compliance.actividad_tratamiento(id),
  titular_ref TEXT NOT NULL,
  version_finalidad TEXT NOT NULL,
  otorgado_en TIMESTAMPTZ NOT NULL,
  retirado_en TIMESTAMPTZ,
  medio TEXT NOT NULL,
  evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance.solicitud_titular (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN
    ('acceso','rectificacion','supresion','oposicion','portabilidad','bloqueo')),
  titular_ref TEXT NOT NULL,
  canal TEXT,
  recibida_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 30 días corridos, prorrogables por 30 más.
  -- Columna con DEFAULT y no GENERATED: sumar un intervalo a un
  -- timestamptz depende del huso horario y Postgres no lo considera
  -- inmutable, así que no admite columna generada.
  vence_en TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  prorrogada_hasta TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'recibida' CHECK (estado IN
    ('recibida','en_proceso','resuelta','rechazada')),
  decision TEXT,
  evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  responsable_id UUID REFERENCES platform.usuarios(id),
  resuelta_en TIMESTAMPTZ
);

COMMENT ON COLUMN compliance.solicitud_titular.vence_en IS
  'Se calcula al recibir, no se escribe a mano. El panel de cumplimiento alerta antes
   de que venza: un plazo que hay que recordar es un plazo que se pasa.';

CREATE TABLE IF NOT EXISTS compliance.incidente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform.tenants(id) ON DELETE SET NULL,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  severidad TEXT NOT NULL CHECK (severidad IN ('baja','media','alta','critica')),
  activos_afectados TEXT[] NOT NULL DEFAULT '{}',
  categorias_datos TEXT[] NOT NULL DEFAULT '{}',
  evaluacion_riesgo TEXT,
  requiere_notificacion BOOLEAN,
  -- 72 horas desde el conocimiento del incidente
  notificar_antes_de TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  notificado_en TIMESTAMPTZ,
  contencion TEXT,
  comunicaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  resuelto_en TIMESTAMPTZ,
  post_mortem TEXT
);

COMMENT ON COLUMN compliance.incidente.requiere_notificacion IS
  'Consecuencia de la evaluación de riesgo, no una decisión informal.';

CREATE TABLE IF NOT EXISTS compliance.politica_retencion (
  codigo TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  objeto TEXT NOT NULL,               -- 'core.checkin'
  criterio TEXT NOT NULL,             -- 'creado_en'
  meses INTEGER NOT NULL,
  accion TEXT NOT NULL CHECK (accion IN ('anonimizar','eliminar','restringir')),
  fundamento TEXT
);

CREATE TABLE IF NOT EXISTS compliance.encargado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  finalidad TEXT NOT NULL,
  categorias_datos TEXT[] NOT NULL DEFAULT '{}',
  ubicacion TEXT,
  subencargados TEXT[] NOT NULL DEFAULT '{}',
  contrato_ref TEXT,
  vigente_desde DATE,
  vigente_hasta DATE
);

CREATE TABLE IF NOT EXISTS compliance.decision_automatizada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                 -- 'oferta_cliente', 'ranking_ruta'…
  regla_version TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  explicacion TEXT NOT NULL,
  revision_humana BOOLEAN NOT NULL DEFAULT TRUE,
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE compliance.decision_automatizada IS
  'D-12 · Toda recomendación (a quién visitar, qué ofrecer) declara
   finalidad, versión de la regla, variables y si hay intervención
   humana. Es exigencia legal y además es lo que permite responder
   "¿por qué me sugirió esto?" sin abrir el código.';

-- ─── RLS de este esquema ───────────────────────────────────────────
-- Va acá y no en 012 porque 012 corre ANTES: una tabla creada después
-- no queda cubierta por un bucle que ya pasó. El diagnóstico (019) lo
-- detecta, y esta es la corrección.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tabla,
           EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                      AND a.attnum > 0 AND NOT a.attisdropped) AS tiene_tenant
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'compliance'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS compliance_acceso ON %s', r.tabla);
    IF r.tiene_tenant THEN
      EXECUTE format($f$
        CREATE POLICY compliance_acceso ON %s FOR ALL
          USING (tenant_id IS NULL OR platform.tiene_acceso(tenant_id))
          WITH CHECK (tenant_id IS NULL OR platform.tiene_acceso(tenant_id))
      $f$, r.tabla);
    ELSE
      -- Catálogos de la plataforma (controles, políticas de retención):
      -- se leen, no se escriben desde la app.
      EXECUTE format($f$
        CREATE POLICY compliance_acceso ON %s FOR SELECT USING (true)
      $f$, r.tabla);
    END IF;
  END LOOP;
END $$;


-- ███ 017_security_baseline.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 017 · LÍNEA BASE DE SEGURIDAD
-- Del paquete legal V1 (013), movido a `compliance` y con los códigos
-- alineados a los controles que esta arquitectura implementa de verdad.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance.control_baseline (
  codigo      TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  bloqueante  BOOLEAN NOT NULL DEFAULT TRUE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  implementado_en TEXT              -- dónde vive el control
);

INSERT INTO compliance.control_baseline (codigo, descripcion, bloqueante, implementado_en) VALUES
 ('RLS_FAIL_CLOSED',       'Toda tabla con datos tiene ENABLE + FORCE RLS y política por tenant', TRUE,  '012'),
 ('SIN_SELECT_STAR',       'El código productivo declara columnas explícitas',                    TRUE,  'guard R7'),
 ('SIN_SECRETOS_EN_REPO',  'Ninguna credencial, JWT o service key en control de versiones',       TRUE,  'guard R8'),
 ('DEFINER_SEARCH_PATH',   'Toda función SECURITY DEFINER fija su search_path',                   TRUE,  '019'),
 ('DEFINER_REVOKE_PUBLIC', 'Las funciones privilegiadas revocan EXECUTE de PUBLIC',               TRUE,  '013/014'),
 ('TOKEN_HASHEADO',        'El catálogo público guarda hash, no el token',                        TRUE,  '009/014'),
 ('TOKEN_EXPIRABLE',       'Los tokens expiran y se pueden revocar',                              TRUE,  '009'),
 ('RATE_LIMIT_PUBLICO',    'Catálogo y pedido público tienen límite de intentos',                 TRUE,  '014'),
 ('AUDITORIA_SENSIBLE',    'Las acciones administrativas dejan evidencia inmutable',              TRUE,  '015'),
 ('PRIVACIDAD_POR_DEFECTO','Los datos personales viven aparte y requieren permiso',               TRUE,  '005/012'),
 ('RETENCION_DEFINIDA',    'La retención está definida por finalidad y tipo de dato',             TRUE,  '018'),
 ('RESPUESTA_INCIDENTES',  'Los incidentes tienen flujo con plazo de 72 h',                       TRUE,  '016'),
 ('REGISTRO_ENCARGADOS',   'Los terceros que tratan datos están registrados',                     TRUE,  '016'),
 ('COMPUERTA_PUBLICACION', 'Ningún lote llega a producción sin reconciliación aprobada',          TRUE,  '010'),
 ('LINAJE_TRAZABLE',       'Toda cifra publicada apunta a su lote de origen',                     TRUE,  '010')
ON CONFLICT (codigo) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      bloqueante  = EXCLUDED.bloqueante,
      implementado_en = EXCLUDED.implementado_en;

-- RLS de esta tabla, acá y no en 012: 012 ya pasó cuando esta tabla se
-- crea. Es un catálogo de la plataforma: se lee, no se escribe desde la app.
ALTER TABLE compliance.control_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.control_baseline FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS control_baseline_lectura ON compliance.control_baseline;
CREATE POLICY control_baseline_lectura ON compliance.control_baseline FOR SELECT USING (true);


-- ███ 018_retencion.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 018 · RETENCIÓN Y ANONIMIZACIÓN
--
-- Retención POR FINALIDAD, no una regla genérica.
-- No se borra evidencia comercial o contable sólo por una regla de
-- privacidad cuando hay obligación legal de conservarla. En esos casos
-- se restringe el uso, se separa el acceso y se anonimiza lo personal.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO compliance.politica_retencion (codigo, descripcion, objeto, criterio, meses, accion, fundamento) VALUES
 ('GPS_EJECUTIVO', 'Posición GPS de check-in de ejecutivos',
  'core.checkin', 'creado_en', 12, 'anonimizar',
  'Dato personal de trabajador. Finalidad de supervisión cumplida; el hecho de la visita se conserva sin coordenadas.'),
 ('NOTAS_VISITA', 'Texto libre sobre clientes y contactos',
  'core.nota_cliente', 'creado_en', 24, 'anonimizar',
  'Dato personal. Utilidad comercial acotada en el tiempo.'),
 ('CONTACTOS_INACTIVOS', 'Contactos de clientes dados de baja',
  'core.cliente_contacto', 'creado_en', 36, 'anonimizar',
  'Sin relación contractual vigente decae la base de legitimidad.'),
 ('VENTAS', 'Líneas de venta',
  'core.venta_linea', 'fecha', 72, 'restringir',
  'CONSERVAR: respaldo tributario y contable. No se elimina por regla de privacidad; se restringe el acceso.'),
 ('AUDITORIA', 'Bitácora de acciones administrativas',
  'platform.auditoria', 'creado_en', 24, 'restringir',
  'Evidencia de controles. Se conserva.')
ON CONFLICT (codigo) DO NOTHING;

-- Anonimizar no es borrar: el hecho se conserva, el dato personal no.
CREATE OR REPLACE FUNCTION compliance.aplicar_retencion(p_dry_run BOOLEAN DEFAULT TRUE)
RETURNS TABLE (politica TEXT, afectadas BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, compliance, core, platform AS $$
DECLARE n BIGINT;
BEGIN
  -- GPS
  SELECT count(*) INTO n FROM core.checkin
   WHERE creado_en < now() - interval '12 months' AND lat IS NOT NULL;
  IF NOT p_dry_run THEN
    UPDATE core.checkin SET lat = NULL, lng = NULL, precision_m = NULL
     WHERE creado_en < now() - interval '12 months' AND lat IS NOT NULL;
  END IF;
  politica := 'GPS_EJECUTIVO'; afectadas := n; RETURN NEXT;

  -- Notas
  SELECT count(*) INTO n FROM core.nota_cliente
   WHERE creado_en < now() - interval '24 months' AND anonimizado_en IS NULL;
  IF NOT p_dry_run THEN
    UPDATE core.nota_cliente
       SET texto = '[anonimizado por política de retención]', anonimizado_en = now()
     WHERE creado_en < now() - interval '24 months' AND anonimizado_en IS NULL;
  END IF;
  politica := 'NOTAS_VISITA'; afectadas := n; RETURN NEXT;

  -- Contactos de clientes inactivos
  SELECT count(*) INTO n
    FROM core.cliente_contacto cc
    JOIN core.cliente c ON c.tenant_id = cc.tenant_id AND c.cliente_key = cc.cliente_key
   WHERE NOT c.activo AND cc.creado_en < now() - interval '36 months'
     AND cc.anonimizado_en IS NULL;
  IF NOT p_dry_run THEN
    UPDATE core.cliente_contacto cc
       SET nombre = NULL, telefono = NULL, email = NULL, anonimizado_en = now()
      FROM core.cliente c
     WHERE c.tenant_id = cc.tenant_id AND c.cliente_key = cc.cliente_key
       AND NOT c.activo AND cc.creado_en < now() - interval '36 months'
       AND cc.anonimizado_en IS NULL;
  END IF;
  politica := 'CONTACTOS_INACTIVOS'; afectadas := n; RETURN NEXT;
END $$;

COMMENT ON FUNCTION compliance.aplicar_retencion(BOOLEAN) IS
  'Por defecto DRY RUN: informa cuántas filas tocaría y no toca nada.
   Un proceso de borrado que se ejecuta solo la primera vez que alguien
   lo prueba es un incidente, no una función.';

REVOKE ALL ON FUNCTION compliance.aplicar_retencion(BOOLEAN) FROM PUBLIC;


-- ███ 019_diagnostics.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 019 · DIAGNÓSTICO · se corre después de cada despliegue
--
-- No modifica nada. Devuelve una fila por chequeo. Si alguno sale
-- FALLA y es bloqueante, el despliegue no se promueve.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compliance.diagnostico()
RETURNS TABLE (control TEXT, estado TEXT, detalle TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, compliance, platform AS $$
DECLARE n INTEGER; txt TEXT;
BEGIN
  -- 1 · Tablas sin RLS
  SELECT count(*), string_agg(n.nspname || '.' || c.relname, ', ')
    INTO n, txt
    FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('core','platform','ingest','compliance')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  control := 'RLS_FAIL_CLOSED';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todas las tablas con ENABLE + FORCE');
  RETURN NEXT;

  -- 2 · Tablas con RLS y sin ninguna política = inaccesibles en silencio
  SELECT count(*), string_agg(n.nspname || '.' || c.relname, ', ')
    INTO n, txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('core','platform','ingest','compliance')
     AND c.relrowsecurity
     -- Sólo importa si el rol de la app puede alcanzarla. Una tabla sin
     -- grants (p. ej. core.rate_limit, que sólo se toca desde funciones
     -- SECURITY DEFINER) ya está cerrada: no tener política ES el cierre.
     AND has_table_privilege('authenticated', c.oid, 'SELECT')
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
  control := 'RLS_CON_POLITICA';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'AVISO' END;
  detalle := COALESCE(txt, 'todas las tablas con política');
  RETURN NEXT;

  -- 3 · SECURITY DEFINER sin search_path fijo
  SELECT count(*), string_agg(n.nspname || '.' || p.proname, ', ')
    INTO n, txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef
     AND n.nspname IN ('core','platform','ingest','compliance','api')
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                          WHERE cfg LIKE 'search_path=%'));
  control := 'DEFINER_SEARCH_PATH';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todas las funciones definer con search_path fijo');
  RETURN NEXT;

  -- 4 · Funciones ejecutables por PUBLIC
  SELECT count(*), string_agg(n.nspname || '.' || p.proname, ', ')
    INTO n, txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef
     AND n.nspname IN ('core','platform','ingest','compliance')
     AND has_function_privilege('public', p.oid, 'EXECUTE');
  control := 'DEFINER_REVOKE_PUBLIC';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'ninguna función privilegiada abierta a PUBLIC');
  RETURN NEXT;

  -- 5 · Vistas de api sin security_invoker (túnel bajo la RLS)
  SELECT count(*), string_agg(c.relname, ', ')
    INTO n, txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = 'api'
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}')) o
                      WHERE o = 'security_invoker=true');
  control := 'VISTAS_SECURITY_INVOKER';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todas las vistas de api con security_invoker');
  RETURN NEXT;

  -- 6 · Tenants sin tipos de documento configurados (D-05 sin cerrar)
  SELECT count(*), string_agg(t.slug, ', ')
    INTO n, txt
    FROM platform.tenants t
   WHERE t.activo
     AND NOT EXISTS (SELECT 1 FROM core.tipo_documento td WHERE td.tenant_id = t.id);
  control := 'TIPOS_DOCUMENTO_CONFIGURADOS';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todos los tenants con tipos de documento');
  RETURN NEXT;

  -- 7 · Tenants sin suscripción: la app les queda apagada (fail-closed).
  --     Es el error seguro, pero hay que verlo, no descubrirlo por un
  --     reclamo del cliente.
  SELECT count(*), string_agg(t.slug, ', ')
    INTO n, txt
    FROM platform.tenants t
   WHERE t.activo
     AND NOT EXISTS (SELECT 1 FROM platform.suscripcion s WHERE s.tenant_id = t.id);
  control := 'SUSCRIPCION_DEFINIDA';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE('sin suscripción: ' || txt, 'todos los tenants con suscripción');
  RETURN NEXT;

  -- 8 · Funciones de api que aceptan tenant_id por parámetro.
  --     Una función así se puede apuntar a otra empresa. El tenant
  --     tiene que salir del JWT. Se exceptúan las de superadmin, que
  --     lo reciben a propósito y validan es_superadmin() adentro.
  SELECT count(*), string_agg(p.proname, ', ')
    INTO n, txt
    FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
   WHERE nn.nspname = 'api'
     AND pg_get_function_arguments(p.oid) ILIKE '%tenant%'
     -- Convención: TODA función de superadmin se llama admin_*. La
     -- excepción es explícita y verificable de un vistazo, en vez de
     -- una lista de nombres que se desactualiza sola.
     AND p.proname NOT LIKE 'admin\_%';
  control := 'API_SIN_TENANT_POR_PARAMETRO';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'ninguna función de api recibe tenant_id del cliente');
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION compliance.diagnostico() FROM PUBLIC;


-- ███ 020_suscripciones.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 020 · SUSCRIPCIONES · el corte de servicio por falta de pago
--
-- LA IDEA CENTRAL: el corte NO se implementa en la app. Se implementa
-- en `platform.tiene_acceso()`, que es la función que YA usan todas las
-- políticas RLS de core, ingest y compliance.
--
-- Consecuencia: suspender una empresa apaga de golpe la app, el
-- dashboard, el catálogo público y cualquier consulta directa a la
-- base. No hay una pantalla que se pueda olvidar de chequear el pago,
-- porque el chequeo no vive en ninguna pantalla.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.suscripcion (
  tenant_id     UUID PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL DEFAULT 'base',
  estado        TEXT NOT NULL DEFAULT 'trial'
                CHECK (estado IN ('trial','activa','morosa','suspendida','cancelada')),
  vigente_hasta DATE NOT NULL,
  -- Cortar el mismo día del vencimiento por un pago atrasado dos días
  -- deja a los vendedores en la calle sin herramienta. La gracia es una
  -- decisión comercial, no un descuido técnico.
  dias_gracia   INTEGER NOT NULL DEFAULT 5 CHECK (dias_gracia >= 0),
  monto_mensual NUMERIC CHECK (monto_mensual IS NULL OR monto_mensual >= 0),
  moneda        TEXT NOT NULL DEFAULT 'CLP',
  max_usuarios  INTEGER,
  notas         TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN platform.suscripcion.estado IS
  'trial y activa dan acceso. morosa da acceso hasta que vence la
   gracia. suspendida y cancelada cortan de inmediato.
   `morosa` existe para no cortarle el día a un vendedor en la calle
   por una transferencia que entra con dos días de atraso.';

CREATE TABLE IF NOT EXISTS platform.pago (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  periodo    DATE NOT NULL,
  monto      NUMERIC NOT NULL CHECK (monto >= 0),
  moneda     TEXT NOT NULL DEFAULT 'CLP',
  pagado_en  DATE,
  referencia TEXT,
  registrado_por UUID REFERENCES platform.usuarios(id),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, periodo)
);

-- ─── El interruptor ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.tenant_habilitado(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT EXISTS (
    SELECT 1
      FROM platform.tenants t
      LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id
     WHERE t.id = p_tenant
       AND t.activo
       -- Sin fila de suscripción NO hay acceso: fail-closed. Un tenant
       -- creado a mano sin plan no queda abierto por descuido.
       AND s.tenant_id IS NOT NULL
       AND (
            s.estado IN ('trial','activa')
         OR (s.estado = 'morosa'
             AND current_date <= s.vigente_hasta + s.dias_gracia)
       )
  );
$$;

-- ─── Se enchufa en la función que ya usan TODAS las políticas ──────
CREATE OR REPLACE FUNCTION platform.tiene_acceso(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT p_tenant IS NOT NULL
     AND p_tenant = platform.tenant_actual()
     AND platform.rol_en_tenant(p_tenant) IS NOT NULL
     -- El superadmin entra igual: si no, no podría reactivar a nadie
     -- ni diagnosticar una empresa cortada.
     AND (platform.es_superadmin() OR platform.tenant_habilitado(p_tenant));
$$;

REVOKE ALL ON FUNCTION platform.tenant_habilitado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.tenant_habilitado(UUID) TO authenticated;

-- RLS: la empresa ve su propia suscripción (para saber que debe pagar),
-- pero NO puede modificarla. Sólo el superadmin escribe acá.
ALTER TABLE platform.suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.suscripcion FORCE  ROW LEVEL SECURITY;
ALTER TABLE platform.pago        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.pago        FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suscripcion_lectura ON platform.suscripcion;
CREATE POLICY suscripcion_lectura ON platform.suscripcion FOR SELECT
  USING (platform.es_superadmin() OR tenant_id = platform.tenant_actual());

DROP POLICY IF EXISTS pago_lectura ON platform.pago;
CREATE POLICY pago_lectura ON platform.pago FOR SELECT
  USING (platform.es_superadmin() OR tenant_id = platform.tenant_actual());

GRANT SELECT ON platform.suscripcion, platform.pago TO authenticated;

DROP TRIGGER IF EXISTS tg_auditar ON platform.suscripcion;
CREATE TRIGGER tg_auditar AFTER INSERT OR UPDATE OR DELETE ON platform.suscripcion
  FOR EACH ROW EXECUTE FUNCTION platform.fn_auditar();


-- ███ 021_capacidades.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 021 · CAPACIDADES POR EMPRESA
--
-- No todas las distribuidoras miden lo mismo. Hay quien lleva la venta
-- por SKU y quien sólo mira el total del cliente. Hay quien no tiene
-- costos. Hay quien no usa catálogo público.
--
-- Nada de eso puede ser un `if` en el código: sería un producto
-- distinto por cliente. Son datos.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.capacidad (
  codigo       TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  descripcion  TEXT NOT NULL,
  requiere     TEXT,                    -- qué archivo/columna necesita
  activa_por_defecto BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO platform.capacidad (codigo, nombre, descripcion, requiere, activa_por_defecto) VALUES
 ('venta_por_sku',    'Venta por producto',
  'Analiza la venta por SKU: mix, focos, venta cruzada, sugerencias por producto. Si está apagada, la empresa sólo ve venta total por cliente.',
  'ventas.sku', TRUE),
 ('foco_sku',         'Focos del mes',
  'Metas de venta por producto y zona.', 'venta_por_sku', TRUE),
 ('metas_ejecutivo',  'Metas por ejecutivo',
  'Meta mensual en pesos por ejecutivo y avance.', NULL, TRUE),
 ('costos_margen',    'Margen y ventas bajo costo',
  'Requiere costo en el archivo de ventas o lista de costos.',
  'ventas.costo_unitario | archivo costos', FALSE),
 ('rutas_gps',        'Ruta y mapa',
  'Ordena la visita por GPS. Requiere comuna o dirección.',
  'maestra.comuna', TRUE),
 ('checkin_gps',      'Check-in con GPS',
  'Verifica la visita por posición. DATO PERSONAL del trabajador: exige finalidad declarada y retención acotada.',
  NULL, TRUE),
 ('catalogo_publico', 'Catálogo para el cliente',
  'Enlace con productos y pedido sin sesión.', 'precios', TRUE),
 ('prospectos',       'Prospectos',
  'Clientes potenciales que no vienen en la maestra.', NULL, TRUE),
 ('stock_disponible', 'Stock',
  'Avisa qué no hay y qué empujar.', 'archivo stock', TRUE),
 ('encuestas_visita', 'Encuestas en visita',
  'Formulario configurable al cerrar una visita.', NULL, FALSE)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
      requiere = EXCLUDED.requiere;

CREATE TABLE IF NOT EXISTS platform.tenant_capacidad (
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  capacidad TEXT NOT NULL REFERENCES platform.capacidad(codigo),
  activa    BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, capacidad)
);

CREATE OR REPLACE FUNCTION platform.capacidad_activa(p_codigo TEXT, p_tenant UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(
    (SELECT tc.activa FROM platform.tenant_capacidad tc
      WHERE tc.tenant_id = COALESCE(p_tenant, platform.tenant_actual())
        AND tc.capacidad = p_codigo),
    (SELECT c.activa_por_defecto FROM platform.capacidad c WHERE c.codigo = p_codigo),
    FALSE                                  -- capacidad desconocida = apagada
  );
$$;

-- Alta de una empresa: se siembran los valores por defecto.
CREATE OR REPLACE FUNCTION platform.sembrar_capacidades(p_tenant UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  INSERT INTO platform.tenant_capacidad (tenant_id, capacidad, activa)
  SELECT p_tenant, c.codigo, c.activa_por_defecto FROM platform.capacidad c
  ON CONFLICT (tenant_id, capacidad) DO NOTHING;
$$;

ALTER TABLE platform.capacidad        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.capacidad        FORCE  ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_capacidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_capacidad FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capacidad_lectura ON platform.capacidad;
CREATE POLICY capacidad_lectura ON platform.capacidad FOR SELECT USING (true);

DROP POLICY IF EXISTS tenant_capacidad_lectura ON platform.tenant_capacidad;
CREATE POLICY tenant_capacidad_lectura ON platform.tenant_capacidad FOR SELECT
  USING (platform.es_superadmin() OR tenant_id = platform.tenant_actual());

GRANT SELECT ON platform.capacidad, platform.tenant_capacidad TO authenticated;
REVOKE ALL ON FUNCTION platform.capacidad_activa(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.sembrar_capacidades(UUID)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.capacidad_activa(TEXT, UUID) TO authenticated;


-- ███ 022_consolas.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 022 · LAS DOS CONSOLAS
--
--   A · Dashboard de gerencia — lo opera cada empresa sobre SUS datos
--   B · Consola de plataforma — la opera Black Sheep sobre TODAS
--
-- Toda función valida permiso en el servidor. El front oculta botones;
-- ocultar un botón no es un control de acceso.
-- ═══════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  A · DASHBOARD DE GERENCIA                                    ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- ─── Qué puede hacer esta empresa (el front dibuja según esto) ─────
CREATE OR REPLACE VIEW api.mis_capacidades
WITH (security_invoker = true) AS
SELECT c.codigo, c.nombre, c.descripcion, c.requiere,
       platform.capacidad_activa(c.codigo) AS activa
  FROM platform.capacidad c;

CREATE OR REPLACE VIEW api.mi_suscripcion
WITH (security_invoker = true) AS
SELECT s.tenant_id, t.nombre AS empresa, s.plan, s.estado, s.vigente_hasta,
       s.dias_gracia,
       (s.vigente_hasta - current_date)                    AS dias_restantes,
       platform.tenant_habilitado(s.tenant_id)             AS habilitado
  FROM platform.suscripcion s
  JOIN platform.tenants t ON t.id = s.tenant_id;

-- ─── Cargas de archivos ────────────────────────────────────────────
CREATE OR REPLACE VIEW api.cargas
WITH (security_invoker = true) AS
SELECT l.id AS lote_id, l.tenant_id, a.tipo, a.nombre_original, a.sha256,
       a.subido_en, l.estado, l.filas_leidas, l.filas_validas,
       l.filas_excluidas, l.motivo_rechazo, l.publicado_en
  FROM ingest.lote l
  JOIN ingest.archivo a ON a.id = l.archivo_id;

CREATE OR REPLACE VIEW api.carga_exclusiones
WITH (security_invoker = true) AS
SELECT l.tenant_id, e.lote_id, e.regla, count(*) AS filas,
       min(e.nro_fila) AS primera_fila
  FROM ingest.exclusion e
  JOIN ingest.lote l ON l.id = e.lote_id
 GROUP BY l.tenant_id, e.lote_id, e.regla;

-- Registra el archivo y abre el lote. El contenido lo procesa el
-- pipeline; esto es la puerta de entrada desde el dashboard.
CREATE OR REPLACE FUNCTION api.registrar_carga(
  p_tipo TEXT, p_nombre TEXT, p_sha256 TEXT,
  p_bytes BIGINT DEFAULT NULL, p_storage_path TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
        v_archivo UUID; v_lote UUID; v_previo INTEGER;
BEGIN
  IF NOT platform.puede('cargar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.tenant_habilitado(v_tenant) THEN
    RAISE EXCEPTION 'suscripcion_inactiva' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('precios','stock','maestra','ventas','costos') THEN
    RAISE EXCEPTION 'tipo_archivo_invalido' USING ERRCODE = '22023';
  END IF;

  -- Mismo archivo ya cargado antes: se avisa, no se bloquea. Puede ser
  -- legítimo (recarga tras corregir la base) pero nunca debe pasar
  -- desapercibido: así se duplicó la venta en la 15.3.
  SELECT count(*) INTO v_previo
    FROM ingest.archivo WHERE tenant_id = v_tenant AND sha256 = p_sha256;

  INSERT INTO ingest.archivo (tenant_id, tipo, nombre_original, sha256, bytes,
                              storage_path, subido_por)
       VALUES (v_tenant, p_tipo, p_nombre, p_sha256, p_bytes,
               p_storage_path, platform.usuario_actual())
    RETURNING id INTO v_archivo;

  INSERT INTO ingest.lote (tenant_id, archivo_id, estado,
                           motivo_rechazo)
       VALUES (v_tenant, v_archivo, 'recibido',
               CASE WHEN v_previo > 0
                    THEN 'AVISO: archivo con hash ya cargado ' || v_previo || ' vez(ces)' END)
    RETURNING id INTO v_lote;

  RETURN v_lote;
END $$;

-- ─── Metas por ejecutivo ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.set_meta(
  p_ejecutivo TEXT, p_mes DATE, p_monto NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('ver_gerencia') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.capacidad_activa('metas_ejecutivo') THEN
    RAISE EXCEPTION 'capacidad_desactivada' USING ERRCODE = '0A000';
  END IF;
  INSERT INTO core.meta (tenant_id, ejecutivo_id, mes, monto)
       VALUES (v_tenant, p_ejecutivo, date_trunc('month', p_mes)::date, p_monto)
  ON CONFLICT (tenant_id, ejecutivo_id, mes)
    DO UPDATE SET monto = EXCLUDED.monto;
END $$;

-- ─── Focos del mes (sólo si la empresa mide por SKU) ───────────────
CREATE OR REPLACE FUNCTION api.set_foco(
  p_mes DATE, p_sku TEXT, p_meta_unidades NUMERIC, p_zona TEXT DEFAULT '*'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('ver_gerencia') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.capacidad_activa('foco_sku') THEN
    RAISE EXCEPTION 'capacidad_desactivada' USING ERRCODE = '0A000';
  END IF;
  INSERT INTO core.foco (tenant_id, mes, sku, zona_id, meta_unidades)
       VALUES (v_tenant, date_trunc('month', p_mes)::date, p_sku,
               COALESCE(p_zona,'*'), p_meta_unidades)
  ON CONFLICT (tenant_id, mes, sku, zona_id)
    DO UPDATE SET meta_unidades = EXCLUDED.meta_unidades;
  UPDATE core.stock SET es_foco_mes = TRUE
   WHERE tenant_id = v_tenant AND sku = p_sku;
END $$;

-- ─── Alta y baja de ejecutivos ─────────────────────────────────────
CREATE OR REPLACE FUNCTION api.alta_ejecutivo(
  p_id TEXT, p_nombre TEXT, p_zona TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL, p_usuario UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('gestionar_usuarios') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.ejecutivo (tenant_id, id, nombre, zona_id, email, usuario_id)
       VALUES (v_tenant, p_id, p_nombre, p_zona, p_email, p_usuario)
  ON CONFLICT (tenant_id, id) DO UPDATE
    SET nombre = EXCLUDED.nombre, zona_id = EXCLUDED.zona_id,
        email = EXCLUDED.email, usuario_id = COALESCE(EXCLUDED.usuario_id, core.ejecutivo.usuario_id),
        activo = TRUE;
END $$;

-- ─── Reasignar cliente o prospecto de zona / ejecutivo ─────────────
CREATE OR REPLACE FUNCTION api.reasignar_cliente(
  p_cliente_key TEXT, p_zona TEXT DEFAULT NULL, p_ejecutivo TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('gestionar_zonas') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE core.cliente
     SET zona_id      = COALESCE(p_zona, zona_id),
         ejecutivo_id = COALESCE(p_ejecutivo, ejecutivo_id),
         actualizado_en = now()
   WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
END $$;

COMMENT ON FUNCTION api.reasignar_cliente(TEXT, TEXT, TEXT) IS
  'OJO: la próxima carga de la maestra PISA esta reasignación, porque
   la maestra manda. Si el cambio es permanente hay que corregir el
   archivo, no la base. El dashboard debe decirlo al confirmar.';

-- ─── Zonas y comunas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.set_zona_comuna(p_comuna TEXT, p_zona TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('gestionar_zonas') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.zona_comuna (tenant_id, comuna, zona_id)
       VALUES (v_tenant, upper(trim(p_comuna)), p_zona)
  ON CONFLICT (tenant_id, comuna) DO UPDATE SET zona_id = EXCLUDED.zona_id;
END $$;


-- ─── Cargar filas del archivo al lote ──────────────────────────────
-- El dashboard sube el Excel, lo parsea en el navegador y manda las
-- filas TAL CUAL. La interpretación es del pipeline, no del front.
CREATE OR REPLACE FUNCTION api.agregar_filas(p_lote UUID, p_filas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_n INTEGER; v_base INTEGER;
BEGIN
  IF NOT platform.puede('cargar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = p_lote AND l.tenant_id = v_tenant
                    AND l.estado = 'recibido') THEN
    RAISE EXCEPTION 'lote_no_disponible' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'filas_debe_ser_arreglo' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(nro_fila), 0) INTO v_base
    FROM ingest.fila_cruda WHERE lote_id = p_lote;

  INSERT INTO ingest.fila_cruda (lote_id, nro_fila, datos)
  SELECT p_lote, v_base + ordinalidad, f
    FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS t(f, ordinalidad)
  ON CONFLICT (lote_id, nro_fila) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE ingest.lote SET filas_leidas = filas_leidas + v_n WHERE id = p_lote;
  RETURN v_n;
END $$;

-- La compuerta (api.publicar_lote) vive en 025_ingest_publicacion.sql,
-- junto con el respaldo y la reversión. Un objeto, un archivo.

-- ─── Baja de ejecutivo ─────────────────────────────────────────────
-- No se borra: la venta histórica quedaría sin dueño.
CREATE OR REPLACE FUNCTION api.baja_ejecutivo(
  p_id TEXT, p_reasignar_a TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_n INTEGER := 0;
BEGIN
  IF NOT platform.puede('gestionar_usuarios') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_reasignar_a IS NOT NULL THEN
    UPDATE core.cliente SET ejecutivo_id = p_reasignar_a, actualizado_en = now()
     WHERE tenant_id = v_tenant AND ejecutivo_id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  UPDATE core.ejecutivo SET activo = FALSE, usuario_id = NULL
   WHERE tenant_id = v_tenant AND id = p_id;
  UPDATE platform.membresias m SET activo = FALSE
    FROM core.ejecutivo e
   WHERE e.tenant_id = v_tenant AND e.id = p_id
     AND m.usuario_id = e.usuario_id AND m.tenant_id = v_tenant;
  RETURN v_n;
END $$;

-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  B · CONSOLA DE PLATAFORMA · sólo superadmin                  ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- Función y no vista: tiene que leer TODAS las empresas, y las
-- políticas RLS de core impiden eso a propósito. La única llave es
-- es_superadmin(), verificada acá adentro.
CREATE OR REPLACE FUNCTION api.admin_empresas()
RETURNS TABLE (
  tenant_id UUID, slug TEXT, empresa TEXT, activo BOOLEAN,
  plan TEXT, estado TEXT, vigente_hasta DATE, dias_restantes INTEGER,
  habilitado BOOLEAN, usuarios BIGINT, clientes BIGINT,
  venta_mtd NUMERIC, ultima_carga TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, core, ingest AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id, t.slug, t.nombre, t.activo,
         s.plan, s.estado, s.vigente_hasta,
         (s.vigente_hasta - current_date)::int,
         platform.tenant_habilitado(t.id),
         (SELECT count(*) FROM platform.membresias m WHERE m.tenant_id = t.id AND m.activo),
         (SELECT count(*) FROM core.cliente c WHERE c.tenant_id = t.id AND c.activo),
         (SELECT COALESCE(sum(v.monto_neto),0) FROM core.venta_linea v
           WHERE v.tenant_id = t.id AND v.fecha >= date_trunc('month', current_date)::date),
         (SELECT max(a.subido_en) FROM ingest.archivo a WHERE a.tenant_id = t.id)
    FROM platform.tenants t
    LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id
   ORDER BY t.nombre;
END $$;

CREATE OR REPLACE FUNCTION api.admin_alta_empresa(
  p_slug TEXT, p_nombre TEXT, p_plan TEXT DEFAULT 'base',
  p_dias_trial INTEGER DEFAULT 30, p_color TEXT DEFAULT '#a3e635'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.tenants (slug, nombre, color)
       VALUES (p_slug, p_nombre, p_color) RETURNING id INTO v_id;
  INSERT INTO platform.suscripcion (tenant_id, plan, estado, vigente_hasta)
       VALUES (v_id, p_plan, 'trial', current_date + p_dias_trial);
  PERFORM platform.sembrar_capacidades(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION api.admin_set_suscripcion(
  p_tenant UUID, p_estado TEXT, p_vigente_hasta DATE DEFAULT NULL,
  p_nota TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.suscripcion
     SET estado = p_estado,
         vigente_hasta = COALESCE(p_vigente_hasta, vigente_hasta),
         notas = COALESCE(p_nota, notas),
         actualizado_en = now()
   WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_sin_suscripcion' USING ERRCODE = 'P0002';
  END IF;
END $$;

COMMENT ON FUNCTION api.admin_set_suscripcion(UUID, TEXT, DATE, TEXT) IS
  'Poner estado = suspendida corta el acceso de esa empresa por
   completo y de inmediato: app, dashboard, catálogo y consultas
   directas. El corte vive en la RLS, no en la interfaz.';

CREATE OR REPLACE FUNCTION api.admin_registrar_pago(
  p_tenant UUID, p_periodo DATE, p_monto NUMERIC,
  p_referencia TEXT DEFAULT NULL, p_meses INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.pago (tenant_id, periodo, monto, pagado_en, referencia, registrado_por)
       VALUES (p_tenant, date_trunc('month', p_periodo)::date, p_monto,
               current_date, p_referencia, platform.usuario_actual())
  ON CONFLICT (tenant_id, periodo) DO UPDATE
    SET monto = EXCLUDED.monto, pagado_en = EXCLUDED.pagado_en,
        referencia = EXCLUDED.referencia;

  UPDATE platform.suscripcion
     SET estado = 'activa',
         vigente_hasta = GREATEST(vigente_hasta, current_date)
                         + (p_meses || ' months')::interval,
         actualizado_en = now()
   WHERE tenant_id = p_tenant;
END $$;

CREATE OR REPLACE FUNCTION api.admin_set_capacidad(
  p_tenant UUID, p_capacidad TEXT, p_activa BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.tenant_capacidad (tenant_id, capacidad, activa)
       VALUES (p_tenant, p_capacidad, p_activa)
  ON CONFLICT (tenant_id, capacidad) DO UPDATE SET activa = EXCLUDED.activa;
END $$;

-- ─── Permisos ──────────────────────────────────────────────────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.registrar_carga(TEXT,TEXT,TEXT,BIGINT,TEXT)',
    'api.set_meta(TEXT,DATE,NUMERIC)',
    'api.set_foco(DATE,TEXT,NUMERIC,TEXT)',
    'api.alta_ejecutivo(TEXT,TEXT,TEXT,TEXT,UUID)',
    'api.reasignar_cliente(TEXT,TEXT,TEXT)',
    'api.set_zona_comuna(TEXT,TEXT)',
    'api.agregar_filas(UUID,JSONB)',
    'api.baja_ejecutivo(TEXT,TEXT)',
    'api.admin_empresas()',
    'api.admin_alta_empresa(TEXT,TEXT,TEXT,INTEGER,TEXT)',
    'api.admin_set_suscripcion(UUID,TEXT,DATE,TEXT)',
    'api.admin_registrar_pago(UUID,DATE,NUMERIC,TEXT,INTEGER)',
    'api.admin_set_capacidad(UUID,TEXT,BOOLEAN)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

GRANT SELECT ON api.mis_capacidades, api.mi_suscripcion,
                api.cargas, api.carga_exclusiones TO authenticated;
GRANT USAGE  ON SCHEMA ingest TO authenticated;
GRANT SELECT ON ingest.lote, ingest.archivo, ingest.exclusion,
                ingest.reconciliacion TO authenticated;


-- ███ 023_ingest_mapeo.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 023 · NORMALIZACIÓN DE COLUMNAS
--
-- El ERP de cada empresa nombra las columnas a su manera: CODIGO,
-- Código, SKU, COD, "Código Producto". El contrato ya sabe cuáles son
-- equivalentes; acá eso deja de ser un diccionario en Python y pasa a
-- ser una tabla, editable por empresa sin tocar código.
--
-- Alias globales (tenant_id NULL) + alias propios de la empresa. Gana
-- el propio: si una distribuidora llama "ARTICULO" a su SKU, se agrega
-- una fila y listo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingest.mapeo_columna (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('precios','stock','maestra','ventas','costos')),
  canonica   TEXT NOT NULL,
  alias_norm TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mapeo_global
  ON ingest.mapeo_columna (tipo, alias_norm) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mapeo_tenant
  ON ingest.mapeo_columna (tenant_id, tipo, alias_norm) WHERE tenant_id IS NOT NULL;

-- Misma normalización para el alias guardado y para la columna que
-- llega del Excel. Si difieren, no cruza nada y todo sale NULL.
CREATE OR REPLACE FUNCTION ingest.norm_texto(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT regexp_replace(
           upper(translate(coalesce(p,''),
                 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
           '[^A-Z0-9]', '', 'g');
$$;

COMMENT ON FUNCTION ingest.norm_texto(TEXT) IS
  'Quita tildes, espacios, puntos y guiones bajos: "Código Producto",
   "CODIGO_PRODUCTO" y "codigo producto" colapsan al mismo valor.';

-- ─── Alias del contrato v3 ─────────────────────────────────────────
INSERT INTO ingest.mapeo_columna (tenant_id, tipo, canonica, alias_norm)
SELECT NULL, t.tipo, t.canonica, ingest.norm_texto(a)
  FROM (VALUES
    ('precios','sku',            ARRAY['sku','Código','CODIGO','Codigo','COD','Código Producto','CODIGO SKU']),
    ('precios','nombre',         ARRAY['nombre','Descripcion','Descripción','DESCRIPCION','Producto','NOMBRE']),
    ('precios','precio_unidad',  ARRAY['precio_unidad','Precio Unidad','PRECIO UNIDAD','Precio Un','P.Unidad']),
    ('precios','precio_caja',    ARRAY['precio_caja','Precio Caja','PRECIO CAJA','P.Caja']),
    ('precios','precio_kilo',    ARRAY['precio_kilo','Precio Kilo','PRECIO KILO']),
    ('precios','categoria',      ARRAY['categoria','Categoría','Categoria','CATEGORIA','Familia']),
    ('precios','marca',          ARRAY['marca','Marca','MARCA']),
    ('precios','unidad_venta',   ARRAY['unidad_venta','Unidad de Venta','UNIDAD','Unidad']),
    ('precios','unidades_caja',  ARRAY['unidades_caja','Unidades por Caja','UN x CAJA']),
    ('precios','kg_unidad',      ARRAY['kg_unidad','Kilogramos por Unidad','KG x UN']),
    ('precios','kg_caja',        ARRAY['kg_caja','Kilogramos por Caja','KG x CAJA']),

    ('stock','sku',              ARRAY['sku','CODIGO','Código','SKU','CODIGO SKU KL','COD']),
    ('stock','stock_total',      ARRAY['stock_total','STOCK','STOCK TOTAL','STOCK KG','KILOS','TOTAL','Stock']),
    ('stock','nombre',           ARRAY['nombre','DESCRIPCION','DESCRIPCION KL','Descripcion']),
    ('stock','familia',          ARRAY['familia','FAMILIA','Familia','CATEGORIA']),
    ('stock','almacen',          ARRAY['almacen','ALMACEN','Almacen','BODEGA']),
    ('stock','stock_cajas',      ARRAY['stock_cajas','STOCK CAJAS','STOCKS CAJAS']),
    ('stock','fecha_venc',       ARRAY['fecha_venc','VENCIMIENTO','FECHA VENC','F.VENC']),

    ('maestra','cliente_key',    ARRAY['cliente_key','rut','RUT','COD CLIENTE','CODIGO_CLIENTE','Codigo']),
    ('maestra','ejecutivo',      ARRAY['ejecutivo','EJECUTIVO','Ejecutivo','VENDEDOR','ejecutivo_raw']),
    ('maestra','zona',           ARRAY['zona','ZONA','CANAL','Canal','zona_comercial']),
    ('maestra','nombre',         ARRAY['nombre','RAZON SOCIAL','NOMBRE','Cliente','nombre_cliente']),
    ('maestra','comuna',         ARRAY['comuna','COMUNA','Comuna']),
    ('maestra','direccion',      ARRAY['direccion','DIRECCION','DOMICILIO','Direccion']),
    ('maestra','lat',            ARRAY['lat','LATITUD','latitud']),
    ('maestra','lng',            ARRAY['lng','LONGITUD','longitud']),
    ('maestra','rubro',          ARRAY['rubro','RUBRO','GIRO','Giro']),
    ('maestra','es_bloqueado',   ARRAY['es_bloqueado','BLOQUEADO','DEUDA']),

    ('ventas','cliente_key',     ARRAY['cliente_key','COD CLIENTE','CODIGO_CLIENTE','RUT','rut','Cliente']),
    ('ventas','fecha',           ARRAY['fecha','FECHA','Fecha','fecha_emision','F.EMISION']),
    ('ventas','sku',             ARRAY['sku','CODIGO','SKU','CODIGO_PRODUCTO','Codigo']),
    ('ventas','monto',           ARRAY['monto','NETO','PRECIO','MONTO','VENTA_NETA','Total']),
    ('ventas','cantidad',        ARRAY['cantidad','CANTIDAD','Cantidad','CANT','UNIDADES']),
    ('ventas','tipo_doc',        ARRAY['tipo_doc','TIPO','TIPO_DOC','TIPO DOCUMENTO','Tipo Doc']),
    ('ventas','documento',       ARRAY['documento','NUMERO','N_DOCUMENTO','FOLIO','Documento']),
    ('ventas','estado_pedido',   ARRAY['estado_pedido','ESTADO','ESTADO_PEDIDO','Estado Pedido']),
    ('ventas','costo_unitario',  ARRAY['costo_unitario','COSTO','COSTO UNITARIO','COSTO_UNIT']),
    ('ventas','producto',        ARRAY['producto','DESCRIPCION','PRODUCTO','Descripcion']),
    ('ventas','nombre',          ARRAY['nombre','RAZON SOCIAL','NOMBRE','Cliente']),
    ('ventas','comuna',          ARRAY['comuna','COMUNA']),
    ('ventas','direccion',       ARRAY['direccion','DIRECCION','DOMICILIO']),
    ('ventas','vendedor_origen', ARRAY['vendedor_origen','EJECUTIVO','VENDEDOR']),

    ('costos','sku',             ARRAY['sku','CODIGO','SKU']),
    ('costos','costo_unitario',  ARRAY['costo_unitario','COSTO','COSTO UNITARIO']),
    ('costos','vigente_desde',   ARRAY['vigente_desde','VIGENCIA','DESDE'])
  ) AS t(tipo, canonica, aliases)
  CROSS JOIN LATERAL unnest(t.aliases) AS a
ON CONFLICT DO NOTHING;

-- ─── Traducir una fila cruda a nombres canónicos ───────────────────
CREATE OR REPLACE FUNCTION ingest.normalizar(
  p_tenant UUID, p_tipo TEXT, p_datos JSONB
) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = pg_catalog, ingest AS $$
  SELECT COALESCE(jsonb_object_agg(m.canonica, d.value), '{}'::jsonb)
    FROM jsonb_each_text(p_datos) AS d(key, value)
    JOIN LATERAL (
      SELECT mc.canonica
        FROM ingest.mapeo_columna mc
       WHERE mc.tipo = p_tipo
         AND mc.alias_norm = ingest.norm_texto(d.key)
         AND (mc.tenant_id = p_tenant OR mc.tenant_id IS NULL)
       ORDER BY mc.tenant_id NULLS LAST      -- el alias propio gana
       LIMIT 1
    ) m ON true
   WHERE NULLIF(trim(d.value), '') IS NOT NULL;
$$;

COMMENT ON FUNCTION ingest.normalizar(UUID, TEXT, JSONB) IS
  'Una columna que el contrato no conoce se DESCARTA en silencio a
   propósito: el cliente puede agregar columnas propias y no rompe
   nada. Lo que no puede faltar son las obligatorias, y eso lo revisa
   la validación, no esta función.';

ALTER TABLE ingest.mapeo_columna ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.mapeo_columna FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON ingest.mapeo_columna;
DROP POLICY IF EXISTS tenant_escritura ON ingest.mapeo_columna;
DROP POLICY IF EXISTS mapeo_acceso     ON ingest.mapeo_columna;
CREATE POLICY mapeo_acceso ON ingest.mapeo_columna FOR ALL
  USING      (tenant_id IS NULL OR platform.tiene_acceso(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND platform.tiene_acceso(tenant_id));

GRANT SELECT ON ingest.mapeo_columna TO authenticated;
GRANT EXECUTE ON FUNCTION ingest.normalizar(UUID, TEXT, JSONB),
                          ingest.norm_texto(TEXT) TO authenticated;


-- ███ 024_ingest_ciclo.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 024 · EL CICLO · una empresa, un lote, un candado
--
-- LO QUE HAY QUE ENTENDER: los cuatro archivos NO se comportan igual.
--
--   ventas   → INCREMENTAL. Cada línea es un hecho que ocurrió. Se
--              acumula por linea_id. Volver a subir el mismo archivo no
--              duplica nada, y subir sólo el día de hoy SUMA al mes.
--
--   precios  → SNAPSHOT. El archivo ES la lista vigente hoy. Pero un
--   stock      snapshot no borra: versiona (precios) o actualiza lo que
--   maestra    trae y desactiva lo ausente (productos, clientes), y
--              siempre con respaldo previo.
--
-- Tratar ventas como snapshot borra el histórico. Tratar la maestra
-- como incremental deja clientes fantasma que nadie da de baja. Por eso
-- el modo es del TIPO de archivo, no una opción del usuario.
--
-- Lo corre la propia empresa desde su dashboard. Ningún paso necesita
-- superadmin ni que alguien de Black Sheep abra el SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Candado por empresa ───────────────────────────────────────────
-- Dos personas de la misma empresa subiendo archivos a la vez es una
-- carrera. Con el candado, la segunda espera; nunca se pisan.
-- El candado es POR TENANT: una empresa no bloquea a otra.
CREATE OR REPLACE FUNCTION ingest.tomar_candado(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql SET search_path = pg_catalog AS $$
  SELECT pg_try_advisory_xact_lock(hashtext('bs_ciclo'), hashtext(p_tenant::text));
$$;

-- ─── Helpers de conversión, tolerantes al formato chileno ──────────
CREATE OR REPLACE FUNCTION ingest.a_numero(p TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE t TEXT;
BEGIN
  t := trim(coalesce(p, ''));
  IF t = '' THEN RETURN NULL; END IF;
  t := replace(replace(replace(t, '$', ''), ' ', ''), chr(160), '');

  -- AMBIGÜEDAD REAL: "12.500" en Chile son doce mil quinientos, no doce
  -- coma cinco. Leerlo mal divide la venta por mil y el error pasa
  -- desapercibido porque el número sigue siendo un número válido.
  IF position(',' in t) > 0 AND position('.' in t) > 0 THEN
    -- Los dos separadores: manda el que está más a la derecha.
    IF position(',' in reverse(t)) < position('.' in reverse(t))
      THEN t := replace(replace(t, '.', ''), ',', '.');   -- 1.234.567,89
      ELSE t := replace(t, ',', '');                      -- 1,234,567.89
    END IF;
  ELSIF position('.' in t) > 0 THEN
    -- Grupos exactos de 3 → separador de miles. Si no, es decimal.
    IF t ~ '^-?\d{1,3}(\.\d{3})+$' THEN t := replace(t, '.', ''); END IF;
  ELSIF position(',' in t) > 0 THEN
    IF t ~ '^-?\d{1,3}(,\d{3})+$'
      THEN t := replace(t, ',', '');       -- 1,234,567
      ELSE t := replace(t, ',', '.');      -- 1,5 → 1.5 (coma decimal chilena)
    END IF;
  END IF;
  RETURN t::numeric;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION ingest.a_fecha(p TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE t TEXT; f DATE;
BEGIN
  t := trim(coalesce(p, ''));
  IF t = '' THEN RETURN NULL; END IF;
  -- Excel guarda fechas como número de días desde 1899-12-30
  IF t ~ '^\d{5}$' THEN RETURN DATE '1899-12-30' + t::int; END IF;
  FOREACH t IN ARRAY ARRAY[t] LOOP
    BEGIN f := to_date(t, 'DD-MM-YYYY');
      IF t ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{4}$' THEN RETURN f; END IF;
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
  BEGIN RETURN t::date; EXCEPTION WHEN others THEN RETURN NULL; END;
END $$;

-- ─── EL CICLO ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.ejecutar_ciclo(
  p_lote UUID, p_venta_oficial NUMERIC DEFAULT NULL
) RETURNS TABLE (paso TEXT, resultado TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, core, platform AS $$
DECLARE
  v_tenant UUID := platform.tenant_actual();
  v_tipo TEXT; v_n INTEGER; v_exc INTEGER; v_ok INTEGER;
  v_suma NUMERIC; v_prev NUMERIC; v_var NUMERIC; v_actual INTEGER;
BEGIN
  IF NOT platform.puede('cargar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT ingest.tomar_candado(v_tenant) THEN
    RAISE EXCEPTION 'ciclo_en_curso' USING ERRCODE = '55P03',
      HINT = 'Otra carga de esta empresa está corriendo. Espere a que termine.';
  END IF;

  SELECT a.tipo INTO v_tipo
    FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
   WHERE l.id = p_lote AND l.tenant_id = v_tenant AND l.estado IN ('recibido','normalizado');
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'lote_no_disponible' USING ERRCODE = 'P0002';
  END IF;

  -- Reejecutable: se limpia lo derivado, NUNCA la fila cruda.
  DELETE FROM ingest.fila_norm WHERE lote_id = p_lote;
  DELETE FROM ingest.exclusion WHERE lote_id = p_lote;
  DELETE FROM ingest.reconciliacion WHERE lote_id = p_lote;

  -- 1 · NORMALIZAR
  INSERT INTO ingest.fila_norm (lote_id, nro_fila, datos)
  SELECT fc.lote_id, fc.nro_fila, ingest.normalizar(v_tenant, v_tipo, fc.datos)
    FROM ingest.fila_cruda fc WHERE fc.lote_id = p_lote;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  paso := '1 · normalizar'; resultado := v_n || ' filas'; RETURN NEXT;

  -- 2 · VALIDAR obligatorias del contrato
  INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
  SELECT fn.lote_id, fn.nro_fila, 'FALTA_OBLIGATORIA', c.campo
    FROM ingest.fila_norm fn
    CROSS JOIN LATERAL unnest(
      CASE v_tipo
        WHEN 'ventas'  THEN ARRAY['cliente_key','fecha','sku','monto','cantidad','tipo_doc']
        WHEN 'maestra' THEN ARRAY['cliente_key','ejecutivo','zona']
        WHEN 'precios' THEN ARRAY['sku','nombre']
        WHEN 'stock'   THEN ARRAY['sku','stock_total']
        WHEN 'costos'  THEN ARRAY['sku','costo_unitario']
      END) AS c(campo)
   WHERE fn.lote_id = p_lote
     AND NULLIF(trim(coalesce(fn.datos ->> c.campo, '')), '') IS NULL
  ON CONFLICT DO NOTHING;

  -- precios: al menos un precio, cualquiera de los tres
  IF v_tipo = 'precios' THEN
    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'SIN_PRECIO', 'ni unidad, ni caja, ni kilo'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND COALESCE(ingest.a_numero(fn.datos->>'precio_unidad'),
                    ingest.a_numero(fn.datos->>'precio_caja'),
                    ingest.a_numero(fn.datos->>'precio_kilo')) IS NULL
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3 · REGLAS DE VENTA (D-05 y D-06)
  IF v_tipo = 'ventas' THEN
    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'FECHA_INVALIDA', fn.datos->>'fecha'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND (ingest.a_fecha(fn.datos->>'fecha') IS NULL
            OR ingest.a_fecha(fn.datos->>'fecha') > current_date)
    ON CONFLICT DO NOTHING;

    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'TIPO_DOC_DESCONOCIDO',
           'no configurado como venta: ' || coalesce(fn.datos->>'tipo_doc','(vacío)')
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM core.tipo_documento td
                        WHERE td.tenant_id = v_tenant
                          AND td.codigo = upper(trim(coalesce(fn.datos->>'tipo_doc','')))
                          AND td.cuenta_como_venta)
    ON CONFLICT DO NOTHING;

    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'ESTADO_EXCLUIDO', fn.datos->>'estado_pedido'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND EXISTS (SELECT 1 FROM core.estado_excluido ee
                    WHERE ee.tenant_id = v_tenant
                      AND ee.estado = upper(trim(coalesce(fn.datos->>'estado_pedido',''))))
    ON CONFLICT DO NOTHING;

    -- Aviso, no exclusión: la venta cuenta igual. El cliente se crea y
    -- queda SIN_ASIGNAR, que es exactamente lo que hay que ir a corregir.
    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'AVISO_CLIENTE_SIN_MAESTRA', fn.datos->>'cliente_key'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM core.cliente c
                        WHERE c.tenant_id = v_tenant
                          AND c.cliente_key = trim(fn.datos->>'cliente_key'))
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(DISTINCT nro_fila) INTO v_exc FROM ingest.exclusion
   WHERE lote_id = p_lote AND regla NOT LIKE 'AVISO\_%';
  v_ok := v_n - v_exc;
  paso := '2 · validar'; resultado := v_ok || ' válidas · ' || v_exc || ' excluidas'; RETURN NEXT;

  -- 4 · RECONCILIAR
  INSERT INTO ingest.reconciliacion (lote_id, metrica, valor_calculado)
  VALUES (p_lote, 'filas_validas', v_ok), (p_lote, 'filas_excluidas', v_exc)
  ON CONFLICT (lote_id, metrica) DO UPDATE SET valor_calculado = EXCLUDED.valor_calculado;

  IF v_tipo = 'ventas' THEN
    SELECT COALESCE(sum(ingest.a_numero(fn.datos->>'monto')
                        * core.signo_documento(v_tenant, fn.datos->>'tipo_doc')), 0)
      INTO v_suma
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%');

    INSERT INTO ingest.reconciliacion (lote_id, metrica, valor_calculado, valor_oficial, diferencia_pct)
    VALUES (p_lote, 'venta_neta', v_suma, p_venta_oficial,
            CASE WHEN p_venta_oficial IS NOT NULL AND p_venta_oficial <> 0
                 THEN round(100 * (v_suma - p_venta_oficial) / abs(p_venta_oficial), 4) END)
    ON CONFLICT (lote_id, metrica) DO UPDATE
      SET valor_calculado = EXCLUDED.valor_calculado,
          valor_oficial   = EXCLUDED.valor_oficial,
          diferencia_pct  = EXCLUDED.diferencia_pct;

    paso := '3 · reconciliar';
    resultado := 'venta neta ' || to_char(v_suma, 'FM999G999G999G999')
      || COALESCE(' · difiere ' || round((SELECT diferencia_pct FROM ingest.reconciliacion
             WHERE lote_id = p_lote AND metrica='venta_neta'), 2)::text || '% del oficial',
          ' · sin total oficial declarado');
    RETURN NEXT;
  ELSE
    -- CONTROL DE CAÍDA para los archivos snapshot. Un export truncado
    -- que trae 40 productos en vez de 4.000 es el accidente clásico.
    SELECT CASE v_tipo
             WHEN 'precios' THEN (SELECT count(*) FROM core.producto WHERE tenant_id=v_tenant AND activo)
             WHEN 'stock'   THEN (SELECT count(*) FROM core.stock    WHERE tenant_id=v_tenant)
             WHEN 'maestra' THEN (SELECT count(*) FROM core.cliente  WHERE tenant_id=v_tenant AND activo)
             WHEN 'costos'  THEN (SELECT count(*) FROM core.costo    WHERE tenant_id=v_tenant)
           END INTO v_actual;
    v_var := CASE WHEN COALESCE(v_actual,0) > 0
                  THEN round(100.0 * (v_ok - v_actual) / v_actual, 2) END;
    INSERT INTO ingest.reconciliacion (lote_id, metrica, valor_calculado, valor_oficial, diferencia_pct)
    VALUES (p_lote, 'variacion_filas', v_ok, v_actual, v_var)
    ON CONFLICT (lote_id, metrica) DO UPDATE
      SET valor_calculado = EXCLUDED.valor_calculado,
          valor_oficial = EXCLUDED.valor_oficial, diferencia_pct = EXCLUDED.diferencia_pct;
    paso := '3 · reconciliar';
    resultado := v_ok || ' filas vs ' || COALESCE(v_actual,0) || ' actuales'
              || COALESCE(' · variación ' || v_var || '%', ' · primera carga');
    RETURN NEXT;
  END IF;

  UPDATE ingest.lote
     SET estado = 'validado', filas_leidas = v_n,
         filas_validas = v_ok, filas_excluidas = v_exc
   WHERE id = p_lote;

  paso := '4 · listo';
  resultado := 'VALIDADO · revisar y publicar';
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION api.ejecutar_ciclo(UUID, NUMERIC) IS
  'El ciclo de UNA empresa sobre UN lote. No toca core: deja el lote en
   `validado` con su reconciliación a la vista. Publicar es un segundo
   acto deliberado (025). Es reejecutable: borra lo derivado y vuelve a
   calcular desde la fila cruda, que nunca se toca.';

REVOKE ALL ON FUNCTION api.ejecutar_ciclo(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.ejecutar_ciclo(UUID, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION ingest.tomar_candado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ingest.a_numero(TEXT), ingest.a_fecha(TEXT) TO authenticated;


-- ███ 025_ingest_publicacion.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 025 · PUBLICAR · con respaldo y con vuelta atrás
--
-- Regla que no se negocia: NADA llega a core sin que antes exista una
-- copia de lo que se va a modificar. Publicar es reversible.
--
-- La compuerta rechaza el lote si:
--   · no está validado
--   · no tiene reconciliación
--   · la diferencia contra el total oficial supera el umbral
--   · un archivo snapshot trae muchas menos filas que las actuales
--     (export truncado) y nadie lo aprobó explícitamente
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingest.respaldo (
  id        BIGSERIAL PRIMARY KEY,
  lote_id   UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  objeto    TEXT NOT NULL,           -- 'core.cliente'
  llave     TEXT NOT NULL,
  fila      JSONB,                   -- NULL = no existía: revertir = borrar
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_respaldo_lote ON ingest.respaldo (lote_id);

COMMENT ON TABLE ingest.respaldo IS
  'Foto de las filas de core ANTES de que el lote las tocara. Con esto
   `api.revertir_lote` deshace una publicación sin restaurar la base
   entera. `fila` NULL significa que la fila no existía: revertir la
   elimina.';

ALTER TABLE ingest.respaldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.respaldo FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON ingest.respaldo;
DROP POLICY IF EXISTS tenant_escritura ON ingest.respaldo;
CREATE POLICY tenant_lectura   ON ingest.respaldo FOR SELECT USING (platform.tiene_acceso(tenant_id));
CREATE POLICY tenant_escritura ON ingest.respaldo FOR ALL
  USING (platform.tiene_acceso(tenant_id)) WITH CHECK (platform.tiene_acceso(tenant_id));
GRANT SELECT ON ingest.respaldo TO authenticated;


-- ─── Conflictos archivo vs dashboard ───────────────────────────────
-- Vive acá porque la publicación es quien los detecta. Las funciones
-- que los resuelven están en 026.
CREATE TABLE IF NOT EXISTS ingest.conflicto (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  lote_id       UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  objeto        TEXT NOT NULL,
  llave         TEXT NOT NULL,
  campo         TEXT NOT NULL,
  valor_archivo TEXT,
  valor_manual  TEXT,
  resuelto_en   TIMESTAMPTZ,
  resolucion    TEXT CHECK (resolucion IN ('mantener_manual','aceptar_archivo')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_conflicto_pendiente
  ON ingest.conflicto (tenant_id, lote_id) WHERE resuelto_en IS NULL;

COMMENT ON TABLE ingest.conflicto IS
  'El archivo dice una cosa y alguien editó otra. No se resuelve solo:
   se muestra. Resolver en silencio a favor de cualquiera de los dos es
   como se pierde la confianza en el sistema.';

ALTER TABLE ingest.conflicto ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.conflicto FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON ingest.conflicto;
DROP POLICY IF EXISTS tenant_escritura ON ingest.conflicto;
CREATE POLICY tenant_lectura   ON ingest.conflicto FOR SELECT USING (platform.tiene_acceso(tenant_id));
CREATE POLICY tenant_escritura ON ingest.conflicto FOR ALL
  USING (platform.tiene_acceso(tenant_id)) WITH CHECK (platform.tiene_acceso(tenant_id));
GRANT SELECT ON ingest.conflicto TO authenticated;

-- ─── LA COMPUERTA + LA APLICACIÓN ──────────────────────────────────
CREATE OR REPLACE FUNCTION api.publicar_lote(
  p_lote UUID,
  p_umbral_pct NUMERIC DEFAULT 1.0,
  p_aprobar_caida BOOLEAN DEFAULT FALSE
) RETURNS TABLE (resultado TEXT, detalle TEXT)
LANGUAGE plpgsql SECURITY DEFINER
-- `public, extensions` porque linea_id usa digest() de pgcrypto.
SET search_path = pg_catalog, ingest, core, platform, public, extensions AS $$
DECLARE
  v_tenant UUID := platform.tenant_actual();
  v_tipo TEXT; v_estado TEXT; v_dif NUMERIC; v_var NUMERIC; v_n INTEGER := 0;
BEGIN
  IF NOT platform.puede('publicar_lote') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT ingest.tomar_candado(v_tenant) THEN
    RAISE EXCEPTION 'ciclo_en_curso' USING ERRCODE = '55P03';
  END IF;

  SELECT a.tipo, l.estado INTO v_tipo, v_estado
    FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
   WHERE l.id = p_lote AND l.tenant_id = v_tenant;
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'lote_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'validado' THEN
    resultado := 'RECHAZADO';
    detalle := 'el lote está en estado ' || v_estado || ': hay que correr el ciclo primero';
    RETURN NEXT; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ingest.reconciliacion WHERE lote_id = p_lote) THEN
    UPDATE ingest.lote SET estado='rechazado',
           motivo_rechazo='sin reconciliación' WHERE id = p_lote;
    resultado := 'RECHAZADO'; detalle := 'sin reconciliación'; RETURN NEXT; RETURN;
  END IF;

  SELECT diferencia_pct INTO v_dif FROM ingest.reconciliacion
   WHERE lote_id = p_lote AND metrica = 'venta_neta';
  IF v_dif IS NOT NULL AND abs(v_dif) > p_umbral_pct THEN
    UPDATE ingest.lote SET estado='rechazado',
           motivo_rechazo = format('venta calculada difiere %s%% del total oficial', round(v_dif,2))
     WHERE id = p_lote;
    resultado := 'RECHAZADO';
    detalle := format('diferencia de %s%% contra el total oficial (umbral %s%%)',
                      round(v_dif,2), p_umbral_pct);
    RETURN NEXT; RETURN;
  END IF;

  SELECT diferencia_pct INTO v_var FROM ingest.reconciliacion
   WHERE lote_id = p_lote AND metrica = 'variacion_filas';
  IF v_var IS NOT NULL AND v_var < -30 AND NOT p_aprobar_caida THEN
    resultado := 'REQUIERE_APROBACION';
    detalle := format('el archivo trae %s%% menos filas que lo vigente. '
                   || 'Si el export está completo, vuelva a publicar aprobando la caída.',
                      round(v_var,2));
    RETURN NEXT; RETURN;
  END IF;

  -- ═══ RESPALDO ANTES DE TOCAR NADA ═══
  IF v_tipo = 'maestra' THEN
    INSERT INTO ingest.respaldo (lote_id, tenant_id, objeto, llave, fila)
    SELECT p_lote, v_tenant, 'core.cliente', c.cliente_key, to_jsonb(c)
      FROM core.cliente c WHERE c.tenant_id = v_tenant;
  ELSIF v_tipo = 'precios' THEN
    INSERT INTO ingest.respaldo (lote_id, tenant_id, objeto, llave, fila)
    SELECT p_lote, v_tenant, 'core.producto', p.sku, to_jsonb(p)
      FROM core.producto p WHERE p.tenant_id = v_tenant;
  ELSIF v_tipo = 'stock' THEN
    INSERT INTO ingest.respaldo (lote_id, tenant_id, objeto, llave, fila)
    SELECT p_lote, v_tenant, 'core.stock', s.sku || '|' || s.almacen, to_jsonb(s)
      FROM core.stock s WHERE s.tenant_id = v_tenant;
  END IF;
  -- ventas es incremental: el respaldo es el propio lote_id de cada
  -- línea, que permite borrarlas selectivamente al revertir.

  -- ═══ APLICAR ═══
  IF v_tipo = 'ventas' THEN
    WITH v AS (
      SELECT fn.nro_fila,
             trim(fn.datos->>'cliente_key')        AS cliente_key,
             ingest.a_fecha(fn.datos->>'fecha')    AS fecha,
             trim(fn.datos->>'sku')                AS sku,
             upper(trim(fn.datos->>'tipo_doc'))    AS tipo_doc,
             nullif(trim(fn.datos->>'documento'),'') AS documento,
             nullif(trim(fn.datos->>'estado_pedido'),'') AS estado_pedido,
             ingest.a_numero(fn.datos->>'cantidad') AS cantidad,
             ingest.a_numero(fn.datos->>'monto')    AS monto,
             ingest.a_numero(fn.datos->>'costo_unitario') AS costo,
             nullif(trim(fn.datos->>'vendedor_origen'),'') AS vendedor
        FROM ingest.fila_norm fn
       WHERE fn.lote_id = p_lote
         AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                          WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                            AND e.regla NOT LIKE 'AVISO\_%')
    ), faltantes AS (   -- clientes con venta que no están en la maestra
      INSERT INTO core.cliente (tenant_id, cliente_key, nombre, lote_id)
      SELECT DISTINCT v_tenant, v.cliente_key, NULL, p_lote FROM v
      ON CONFLICT (tenant_id, cliente_key) DO NOTHING
      RETURNING 1
    )
    INSERT INTO core.venta_linea (tenant_id, linea_id, cliente_key, fecha, sku,
                                  tipo_doc, documento, estado_pedido, cantidad,
                                  monto_neto, costo_unitario, vendedor_origen, lote_id)
    SELECT v_tenant,
           encode(digest(concat_ws('|', v_tenant::text, v.cliente_key, v.fecha::text,
                                   v.tipo_doc, coalesce(v.documento,''), v.sku,
                                   v.monto::text), 'sha256'), 'hex'),
           v.cliente_key, v.fecha, v.sku, v.tipo_doc, v.documento, v.estado_pedido,
           v.cantidad,
           v.monto * core.signo_documento(v_tenant, v.tipo_doc),   -- D-06
           v.costo, v.vendedor, p_lote
      FROM v
    ON CONFLICT (tenant_id, linea_id) DO NOTHING;   -- idempotente
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_tipo = 'maestra' THEN
    -- CONFLICTOS: el archivo trae un valor y alguien editó otro a mano.
    -- Se registran para que gerencia decida; el campo manual NO se pisa.
    INSERT INTO ingest.conflicto (tenant_id, lote_id, objeto, llave, campo,
                                  valor_archivo, valor_manual)
    SELECT v_tenant, p_lote, 'core.cliente', c.cliente_key, x.campo,
           x.valor_archivo, x.valor_manual
      FROM ingest.fila_norm fn
      JOIN core.cliente c
        ON c.tenant_id = v_tenant AND c.cliente_key = trim(fn.datos->>'cliente_key')
      CROSS JOIN LATERAL (VALUES
        ('zona_id',      upper(trim(fn.datos->>'zona')),      c.zona_id),
        ('ejecutivo_id', upper(trim(fn.datos->>'ejecutivo')), c.ejecutivo_id),
        ('comuna',       upper(trim(fn.datos->>'comuna')),    c.comuna),
        ('nombre',       trim(fn.datos->>'nombre'),           c.nombre)
      ) AS x(campo, valor_archivo, valor_manual)
     WHERE fn.lote_id = p_lote
       AND x.campo = ANY(c.campos_manuales)
       AND x.valor_archivo IS DISTINCT FROM x.valor_manual
       AND x.valor_archivo IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ingest.conflicto k
                        WHERE k.lote_id = p_lote AND k.llave = c.cliente_key
                          AND k.campo = x.campo);

    INSERT INTO core.zona (tenant_id, id, nombre)
    SELECT DISTINCT v_tenant, upper(trim(fn.datos->>'zona')), upper(trim(fn.datos->>'zona'))
      FROM ingest.fila_norm fn WHERE fn.lote_id = p_lote
        AND nullif(trim(fn.datos->>'zona'),'') IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO core.ejecutivo (tenant_id, id, nombre, zona_id)
    SELECT DISTINCT v_tenant, upper(trim(fn.datos->>'ejecutivo')),
           trim(fn.datos->>'ejecutivo'), upper(trim(fn.datos->>'zona'))
      FROM ingest.fila_norm fn WHERE fn.lote_id = p_lote
        AND nullif(trim(fn.datos->>'ejecutivo'),'') IS NOT NULL
    ON CONFLICT (tenant_id, id) DO NOTHING;

    INSERT INTO core.cliente (tenant_id, cliente_key, nombre, comuna, direccion,
                              lat, lng, rubro, zona_id, ejecutivo_id, es_bloqueado,
                              activo, lote_id, actualizado_en)
    SELECT v_tenant, trim(fn.datos->>'cliente_key'),
           nullif(trim(fn.datos->>'nombre'),''),
           upper(nullif(trim(fn.datos->>'comuna'),'')),
           nullif(trim(fn.datos->>'direccion'),''),
           ingest.a_numero(fn.datos->>'lat'), ingest.a_numero(fn.datos->>'lng'),
           nullif(trim(fn.datos->>'rubro'),''),
           upper(trim(fn.datos->>'zona')), upper(trim(fn.datos->>'ejecutivo')),
           upper(coalesce(fn.datos->>'es_bloqueado','')) IN ('SI','SÍ','TRUE','1'),
           TRUE, p_lote, now()
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    -- LA MAESTRA MANDA, salvo en los campos editados a mano desde el
    -- dashboard. Ese es el trato: si el cliente corrige algo, la carga
    -- siguiente no se lo borra; deja el desacuerdo anotado arriba.
    ON CONFLICT (tenant_id, cliente_key) DO UPDATE SET
       nombre = CASE WHEN 'nombre' = ANY(core.cliente.campos_manuales)
                     THEN core.cliente.nombre
                     ELSE COALESCE(EXCLUDED.nombre, core.cliente.nombre) END,
       comuna = CASE WHEN 'comuna' = ANY(core.cliente.campos_manuales)
                     THEN core.cliente.comuna
                     ELSE COALESCE(EXCLUDED.comuna, core.cliente.comuna) END,
       direccion = CASE WHEN 'direccion' = ANY(core.cliente.campos_manuales)
                        THEN core.cliente.direccion
                        ELSE COALESCE(EXCLUDED.direccion, core.cliente.direccion) END,
       lat = CASE WHEN 'lat' = ANY(core.cliente.campos_manuales)
                  THEN core.cliente.lat ELSE COALESCE(EXCLUDED.lat, core.cliente.lat) END,
       lng = CASE WHEN 'lng' = ANY(core.cliente.campos_manuales)
                  THEN core.cliente.lng ELSE COALESCE(EXCLUDED.lng, core.cliente.lng) END,
       rubro = CASE WHEN 'rubro' = ANY(core.cliente.campos_manuales)
                    THEN core.cliente.rubro ELSE COALESCE(EXCLUDED.rubro, core.cliente.rubro) END,
       zona_id = CASE WHEN 'zona_id' = ANY(core.cliente.campos_manuales)
                      THEN core.cliente.zona_id ELSE EXCLUDED.zona_id END,
       ejecutivo_id = CASE WHEN 'ejecutivo_id' = ANY(core.cliente.campos_manuales)
                           THEN core.cliente.ejecutivo_id ELSE EXCLUDED.ejecutivo_id END,
       es_bloqueado = CASE WHEN 'es_bloqueado' = ANY(core.cliente.campos_manuales)
                           THEN core.cliente.es_bloqueado ELSE EXCLUDED.es_bloqueado END,
       activo = TRUE, lote_id = EXCLUDED.lote_id, actualizado_en = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- Ausente del archivo = se desactiva, NO se borra. La venta
    -- histórica de ese cliente tiene que seguir cuadrando.
    -- Ausente del archivo = se desactiva. PERO sólo lo que vino del
    -- archivo: un prospecto o un cliente creado en el dashboard no está
    -- en la maestra y desactivarlo sería borrar el trabajo del vendedor.
    UPDATE core.cliente c SET activo = FALSE, actualizado_en = now()
     WHERE c.tenant_id = v_tenant AND c.activo
       AND c.origen = 'archivo'
       AND NOT c.es_prospecto
       AND NOT EXISTS (SELECT 1 FROM ingest.fila_norm fn
                        WHERE fn.lote_id = p_lote
                          AND trim(fn.datos->>'cliente_key') = c.cliente_key);

  ELSIF v_tipo = 'precios' THEN
    INSERT INTO core.producto (tenant_id, sku, nombre, categoria, marca,
                               unidad_venta, unidades_caja, kg_unidad, kg_caja,
                               activo, lote_id, actualizado_en)
    SELECT v_tenant, trim(fn.datos->>'sku'), trim(fn.datos->>'nombre'),
           nullif(trim(fn.datos->>'categoria'),''), nullif(trim(fn.datos->>'marca'),''),
           nullif(trim(fn.datos->>'unidad_venta'),''),
           ingest.a_numero(fn.datos->>'unidades_caja'),
           ingest.a_numero(fn.datos->>'kg_unidad'),
           ingest.a_numero(fn.datos->>'kg_caja'),
           TRUE, p_lote, now()
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    ON CONFLICT (tenant_id, sku) DO UPDATE SET
       nombre = CASE WHEN 'nombre' = ANY(core.producto.campos_manuales)
                     THEN core.producto.nombre ELSE EXCLUDED.nombre END,
       categoria = CASE WHEN 'categoria' = ANY(core.producto.campos_manuales)
                        THEN core.producto.categoria
                        ELSE COALESCE(EXCLUDED.categoria, core.producto.categoria) END,
       marca = CASE WHEN 'marca' = ANY(core.producto.campos_manuales)
                    THEN core.producto.marca
                    ELSE COALESCE(EXCLUDED.marca, core.producto.marca) END,
       unidad_venta = CASE WHEN 'unidad_venta' = ANY(core.producto.campos_manuales)
                           THEN core.producto.unidad_venta
                           ELSE COALESCE(EXCLUDED.unidad_venta, core.producto.unidad_venta) END,
       activo = TRUE, lote_id = EXCLUDED.lote_id, actualizado_en = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- Precio HISTORIZADO: no se pisa el de ayer, se agrega el de hoy.
    INSERT INTO core.precio (tenant_id, sku, lista, precio_unidad, precio_caja,
                             precio_kilo, vigente_desde, lote_id)
    SELECT v_tenant, trim(fn.datos->>'sku'), 'general',
           ingest.a_numero(fn.datos->>'precio_unidad'),
           ingest.a_numero(fn.datos->>'precio_caja'),
           ingest.a_numero(fn.datos->>'precio_kilo'),
           current_date, p_lote
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    ON CONFLICT (tenant_id, sku, lista, vigente_desde) DO UPDATE SET
       precio_unidad = EXCLUDED.precio_unidad, precio_caja = EXCLUDED.precio_caja,
       precio_kilo = EXCLUDED.precio_kilo, lote_id = EXCLUDED.lote_id;

  ELSIF v_tipo = 'stock' THEN
    INSERT INTO core.stock (tenant_id, sku, almacen, stock_total, stock_cajas,
                            fecha_venc, lote_id, actualizado_en)
    SELECT v_tenant, trim(fn.datos->>'sku'),
           COALESCE(nullif(trim(fn.datos->>'almacen'),''), 'principal'),
           COALESCE(ingest.a_numero(fn.datos->>'stock_total'), 0),
           ingest.a_numero(fn.datos->>'stock_cajas'),
           ingest.a_fecha(fn.datos->>'fecha_venc'), p_lote, now()
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND EXISTS (SELECT 1 FROM core.producto p
                    WHERE p.tenant_id = v_tenant AND p.sku = trim(fn.datos->>'sku'))
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    ON CONFLICT (tenant_id, sku, almacen) DO UPDATE SET
       stock_total = EXCLUDED.stock_total, stock_cajas = EXCLUDED.stock_cajas,
       fecha_venc = EXCLUDED.fecha_venc, lote_id = EXCLUDED.lote_id,
       actualizado_en = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_tipo = 'costos' THEN
    INSERT INTO core.costo (tenant_id, sku, costo_unitario, vigente_desde, origen, lote_id)
    SELECT v_tenant, trim(fn.datos->>'sku'),
           ingest.a_numero(fn.datos->>'costo_unitario'),
           COALESCE(ingest.a_fecha(fn.datos->>'vigente_desde'), current_date),
           'lista', p_lote
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND EXISTS (SELECT 1 FROM core.producto p
                    WHERE p.tenant_id = v_tenant AND p.sku = trim(fn.datos->>'sku'))
       AND ingest.a_numero(fn.datos->>'costo_unitario') IS NOT NULL
    ON CONFLICT (tenant_id, sku, vigente_desde) DO UPDATE SET
       costo_unitario = EXCLUDED.costo_unitario, lote_id = EXCLUDED.lote_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  UPDATE ingest.lote
     SET estado='publicado', publicado_en = now(),
         publicado_por = platform.usuario_actual(), motivo_rechazo = NULL
   WHERE id = p_lote;

  resultado := 'PUBLICADO';
  detalle := v_n || ' filas aplicadas a core · respaldo disponible para revertir';
  RETURN NEXT;
END $$;

-- ─── VUELTA ATRÁS ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.revertir_lote(p_lote UUID)
RETURNS TABLE (resultado TEXT, detalle TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_tipo TEXT; v_n INTEGER := 0;
BEGIN
  IF NOT platform.puede('publicar_lote') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT a.tipo INTO v_tipo
    FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
   WHERE l.id = p_lote AND l.tenant_id = v_tenant AND l.estado = 'publicado';
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'lote_no_publicado' USING ERRCODE = 'P0002';
  END IF;

  IF v_tipo = 'ventas' THEN
    -- Sólo las líneas que ESTE lote creó. Las de lotes anteriores no se
    -- tocan: por eso linea_id guarda su lote de origen.
    DELETE FROM core.venta_linea WHERE tenant_id = v_tenant AND lote_id = p_lote;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'maestra' THEN
    DELETE FROM core.cliente c
     WHERE c.tenant_id = v_tenant AND c.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.respaldo r
                        WHERE r.lote_id = p_lote AND r.objeto='core.cliente'
                          AND r.llave = c.cliente_key);
    UPDATE core.cliente c SET
      nombre = r.fila->>'nombre', comuna = r.fila->>'comuna',
      direccion = r.fila->>'direccion', zona_id = r.fila->>'zona_id',
      ejecutivo_id = r.fila->>'ejecutivo_id',
      es_bloqueado = (r.fila->>'es_bloqueado')::boolean,
      activo = (r.fila->>'activo')::boolean, actualizado_en = now()
      FROM ingest.respaldo r
     WHERE r.lote_id = p_lote AND r.objeto = 'core.cliente'
       AND c.tenant_id = v_tenant AND c.cliente_key = r.llave;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'precios' THEN
    DELETE FROM core.precio WHERE tenant_id = v_tenant AND lote_id = p_lote;
    UPDATE core.producto p SET
      nombre = r.fila->>'nombre', categoria = r.fila->>'categoria',
      marca = r.fila->>'marca', activo = (r.fila->>'activo')::boolean
      FROM ingest.respaldo r
     WHERE r.lote_id = p_lote AND r.objeto = 'core.producto'
       AND p.tenant_id = v_tenant AND p.sku = r.llave;
    DELETE FROM core.producto p
     WHERE p.tenant_id = v_tenant AND p.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.respaldo r
                        WHERE r.lote_id = p_lote AND r.objeto='core.producto' AND r.llave = p.sku);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'stock' THEN
    UPDATE core.stock s SET
      stock_total = (r.fila->>'stock_total')::numeric,
      stock_cajas = (r.fila->>'stock_cajas')::numeric
      FROM ingest.respaldo r
     WHERE r.lote_id = p_lote AND r.objeto = 'core.stock'
       AND s.tenant_id = v_tenant AND s.sku || '|' || s.almacen = r.llave;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'costos' THEN
    DELETE FROM core.costo WHERE tenant_id = v_tenant AND lote_id = p_lote;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  UPDATE ingest.lote SET estado = 'validado', publicado_en = NULL,
         motivo_rechazo = 'revertido por ' || COALESCE(platform.usuario_actual()::text,'?')
   WHERE id = p_lote;

  resultado := 'REVERTIDO'; detalle := v_n || ' filas restauradas'; RETURN NEXT;
END $$;

COMMENT ON FUNCTION api.revertir_lote(UUID) IS
  'Deshace UNA publicación sin restaurar la base entera. Existe porque
   la alternativa real, cuando algo sale mal, es que alguien borre una
   tabla a mano a las once de la noche.';

REVOKE ALL ON FUNCTION api.publicar_lote(UUID, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.revertir_lote(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.publicar_lote(UUID, NUMERIC, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION api.revertir_lote(UUID) TO authenticated;


-- ███ 026_dashboard_edicion.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 026 · EDICIÓN DESDE EL DASHBOARD
--
-- EL PROBLEMA QUE RESUELVE ESTE ARCHIVO
-- Si gerencia mueve un cliente de zona desde el dashboard y mañana
-- vuelve a subir la maestra, el archivo lo pisa. "La maestra manda" es
-- correcto para lo que viene del archivo, pero convierte cualquier
-- corrección manual en trabajo perdido.
--
-- SOLUCIÓN: procedencia por campo. Cada fila recuerda QUÉ campos fueron
-- editados a mano. La carga siguiente respeta esos campos y registra el
-- desacuerdo como CONFLICTO, para que alguien decida. No se pierde el
-- cambio ni se esconde que el archivo dice otra cosa.
--
-- Regla de oro: la venta NO se edita a mano. Nunca. Un ajuste manual de
-- venta es un descuadre contable que después nadie puede explicar. Las
-- ventas entran sólo por archivo (024/025).
-- ═══════════════════════════════════════════════════════════════════

-- Las columnas de procedencia (campos_manuales, origen, es_prospecto)
-- se declaran en la migración de cada tabla: 005 para cliente, 006 para
-- producto, precio y stock. Acá viven los conflictos y las funciones.

CREATE INDEX IF NOT EXISTS ix_cliente_prospecto
  ON core.cliente (tenant_id, ejecutivo_id) WHERE es_prospecto AND activo;

-- ─── Conflictos archivo vs dashboard ───────────────────────────────
-- La tabla ingest.conflicto se declara en 025, que es quien la
-- escribe durante la publicación. Acá están las funciones que la leen
-- y la resuelven.

-- ─── Permiso ───────────────────────────────────────────────────────
INSERT INTO platform.rol_permiso (rol, permiso) VALUES
  ('tenant_admin','editar_datos'), ('gerencia','editar_datos'),
  ('ejecutivo','crear_prospecto')
ON CONFLICT DO NOTHING;

-- ─── Helper: marcar un campo como manual ───────────────────────────
CREATE OR REPLACE FUNCTION core.marcar_manual(p_actual TEXT[], p_campos TEXT[])
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(p_actual,'{}') || COALESCE(p_campos,'{}')));
$$;

-- ═══ CLIENTES ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_cliente(
  p_cliente_key TEXT,
  p_nombre TEXT DEFAULT NULL, p_zona TEXT DEFAULT NULL, p_ejecutivo TEXT DEFAULT NULL,
  p_comuna TEXT DEFAULT NULL, p_direccion TEXT DEFAULT NULL,
  p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL, p_rubro TEXT DEFAULT NULL,
  p_bloqueado BOOLEAN DEFAULT NULL, p_persona_natural BOOLEAN DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_campos TEXT[] := '{}'::text[]; v_nuevo BOOLEAN;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_cliente_key),'') IS NULL THEN
    RAISE EXCEPTION 'cliente_key_requerido' USING ERRCODE = '22023';
  END IF;

  -- Sólo se marca como manual lo que efectivamente se mandó. Un campo
  -- en NULL significa "no lo toques", no "bórralo".
  IF p_nombre     IS NOT NULL THEN v_campos := v_campos || 'nombre'::text;       END IF;
  IF p_zona       IS NOT NULL THEN v_campos := v_campos || 'zona_id'::text;      END IF;
  IF p_ejecutivo  IS NOT NULL THEN v_campos := v_campos || 'ejecutivo_id'::text; END IF;
  IF p_comuna     IS NOT NULL THEN v_campos := v_campos || 'comuna'::text;       END IF;
  IF p_direccion  IS NOT NULL THEN v_campos := v_campos || 'direccion'::text;    END IF;
  IF p_lat        IS NOT NULL THEN v_campos := v_campos || 'lat'::text;          END IF;
  IF p_lng        IS NOT NULL THEN v_campos := v_campos || 'lng'::text;          END IF;
  IF p_rubro      IS NOT NULL THEN v_campos := v_campos || 'rubro'::text;        END IF;
  IF p_bloqueado  IS NOT NULL THEN v_campos := v_campos || 'es_bloqueado'::text; END IF;

  SELECT NOT EXISTS (SELECT 1 FROM core.cliente
                      WHERE tenant_id = v_tenant AND cliente_key = trim(p_cliente_key))
    INTO v_nuevo;

  INSERT INTO core.cliente (tenant_id, cliente_key, nombre, zona_id, ejecutivo_id,
                            comuna, direccion, lat, lng, rubro, es_bloqueado,
                            es_persona_natural, origen, campos_manuales, activo, actualizado_en)
  VALUES (v_tenant, trim(p_cliente_key), p_nombre, p_zona, p_ejecutivo,
          upper(nullif(trim(p_comuna),'')), p_direccion, p_lat, p_lng, p_rubro,
          COALESCE(p_bloqueado,false), COALESCE(p_persona_natural,false),
          'dashboard', v_campos, TRUE, now())
  ON CONFLICT (tenant_id, cliente_key) DO UPDATE SET
     nombre        = COALESCE(EXCLUDED.nombre,       core.cliente.nombre),
     zona_id       = COALESCE(EXCLUDED.zona_id,      core.cliente.zona_id),
     ejecutivo_id  = COALESCE(EXCLUDED.ejecutivo_id, core.cliente.ejecutivo_id),
     comuna        = COALESCE(EXCLUDED.comuna,       core.cliente.comuna),
     direccion     = COALESCE(EXCLUDED.direccion,    core.cliente.direccion),
     lat           = COALESCE(EXCLUDED.lat,          core.cliente.lat),
     lng           = COALESCE(EXCLUDED.lng,          core.cliente.lng),
     rubro         = COALESCE(EXCLUDED.rubro,        core.cliente.rubro),
     es_bloqueado  = COALESCE(p_bloqueado,           core.cliente.es_bloqueado),
     es_persona_natural = COALESCE(p_persona_natural, core.cliente.es_persona_natural),
     campos_manuales = core.marcar_manual(core.cliente.campos_manuales, v_campos),
     actualizado_en = now();

  RETURN CASE WHEN v_nuevo THEN 'creado' ELSE 'actualizado' END;
END $$;

COMMENT ON FUNCTION api.guardar_cliente IS
  'Crea o edita. Los campos que se envían quedan marcados como manuales
   y la próxima carga de la maestra NO los pisa: registra el desacuerdo
   en ingest.conflicto para que alguien decida.';

-- ═══ PROSPECTOS ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_prospecto(
  p_cliente_key TEXT, p_nombre TEXT, p_ejecutivo TEXT,
  p_zona TEXT DEFAULT NULL, p_comuna TEXT DEFAULT NULL,
  p_direccion TEXT DEFAULT NULL, p_rubro TEXT DEFAULT NULL,
  p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_zona TEXT := p_zona;
BEGIN
  IF NOT (platform.puede('editar_datos') OR platform.puede('crear_prospecto')) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.capacidad_activa('prospectos') THEN
    RAISE EXCEPTION 'capacidad_desactivada' USING ERRCODE = '0A000';
  END IF;

  -- Si no se declara zona, se deduce de la comuna. Un prospecto sin
  -- zona no le aparece a nadie en la cartera.
  IF v_zona IS NULL AND p_comuna IS NOT NULL THEN
    SELECT zc.zona_id INTO v_zona FROM core.zona_comuna zc
     WHERE zc.tenant_id = v_tenant AND zc.comuna = upper(trim(p_comuna));
  END IF;
  IF v_zona IS NULL THEN
    SELECT e.zona_id INTO v_zona FROM core.ejecutivo e
     WHERE e.tenant_id = v_tenant AND e.id = p_ejecutivo;
  END IF;

  INSERT INTO core.cliente (tenant_id, cliente_key, nombre, ejecutivo_id, zona_id,
                            comuna, direccion, rubro, lat, lng,
                            es_prospecto, origen, activo,
                            campos_manuales, actualizado_en)
  VALUES (v_tenant, trim(p_cliente_key), p_nombre, p_ejecutivo, v_zona,
          upper(nullif(trim(p_comuna),'')), p_direccion, p_rubro, p_lat, p_lng,
          TRUE, 'dashboard', TRUE,
          ARRAY['nombre','ejecutivo_id','zona_id'], now())
  ON CONFLICT (tenant_id, cliente_key) DO UPDATE SET
     nombre = COALESCE(EXCLUDED.nombre, core.cliente.nombre),
     ejecutivo_id = EXCLUDED.ejecutivo_id,
     zona_id = COALESCE(EXCLUDED.zona_id, core.cliente.zona_id),
     comuna = COALESCE(EXCLUDED.comuna, core.cliente.comuna),
     direccion = COALESCE(EXCLUDED.direccion, core.cliente.direccion),
     campos_manuales = core.marcar_manual(core.cliente.campos_manuales,
                                          ARRAY['nombre','ejecutivo_id','zona_id']),
     actualizado_en = now();
  RETURN 'ok';
END $$;

COMMENT ON FUNCTION api.guardar_prospecto IS
  'Un prospecto es un cliente sin historial. Cuando compra y aparece en
   la venta, deja de ser prospecto solo: no hay que migrarlo de tabla.';

CREATE OR REPLACE FUNCTION api.convertir_prospecto(p_cliente_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE core.cliente SET es_prospecto = FALSE, actualizado_en = now()
   WHERE tenant_id = platform.tenant_actual() AND cliente_key = p_cliente_key;
END $$;

-- ═══ PRODUCTOS, PRECIOS, COSTOS Y STOCK ═════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_producto(
  p_sku TEXT, p_nombre TEXT,
  p_categoria TEXT DEFAULT NULL, p_marca TEXT DEFAULT NULL,
  p_unidad_venta TEXT DEFAULT NULL, p_unidades_caja NUMERIC DEFAULT NULL,
  p_kg_unidad NUMERIC DEFAULT NULL, p_imagen_url TEXT DEFAULT NULL,
  p_activo BOOLEAN DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_campos TEXT[] := ARRAY['nombre']::text[];
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_categoria    IS NOT NULL THEN v_campos := v_campos || 'categoria'::text;    END IF;
  IF p_marca        IS NOT NULL THEN v_campos := v_campos || 'marca'::text;        END IF;
  IF p_unidad_venta IS NOT NULL THEN v_campos := v_campos || 'unidad_venta'::text; END IF;
  IF p_imagen_url   IS NOT NULL THEN v_campos := v_campos || 'imagen_url'::text;   END IF;

  INSERT INTO core.producto (tenant_id, sku, nombre, categoria, marca, unidad_venta,
                             unidades_caja, kg_unidad, imagen_url, activo,
                             origen, campos_manuales, actualizado_en)
  VALUES (v_tenant, trim(p_sku), p_nombre, p_categoria, p_marca, p_unidad_venta,
          p_unidades_caja, p_kg_unidad, p_imagen_url, COALESCE(p_activo,TRUE),
          'dashboard', v_campos, now())
  ON CONFLICT (tenant_id, sku) DO UPDATE SET
     nombre        = COALESCE(EXCLUDED.nombre,        core.producto.nombre),
     categoria     = COALESCE(EXCLUDED.categoria,     core.producto.categoria),
     marca         = COALESCE(EXCLUDED.marca,         core.producto.marca),
     unidad_venta  = COALESCE(EXCLUDED.unidad_venta,  core.producto.unidad_venta),
     unidades_caja = COALESCE(EXCLUDED.unidades_caja, core.producto.unidades_caja),
     kg_unidad     = COALESCE(EXCLUDED.kg_unidad,     core.producto.kg_unidad),
     imagen_url    = COALESCE(EXCLUDED.imagen_url,    core.producto.imagen_url),
     activo        = COALESCE(p_activo,               core.producto.activo),
     campos_manuales = core.marcar_manual(core.producto.campos_manuales, v_campos),
     actualizado_en = now();
  RETURN 'ok';
END $$;

-- El precio NO se pisa: se agrega uno nuevo con su fecha. Cambiar el
-- precio de hoy no puede alterar lo que se cobró el mes pasado.
CREATE OR REPLACE FUNCTION api.guardar_precio(
  p_sku TEXT, p_precio_unidad NUMERIC DEFAULT NULL,
  p_precio_caja NUMERIC DEFAULT NULL, p_precio_kilo NUMERIC DEFAULT NULL,
  p_vigente_desde DATE DEFAULT NULL, p_lista TEXT DEFAULT 'general'
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_precio_unidad, p_precio_caja, p_precio_kilo) IS NULL THEN
    RAISE EXCEPTION 'sin_precio' USING ERRCODE = '22023',
      HINT = 'Hay que indicar al menos un precio: unidad, caja o kilo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.producto
                  WHERE tenant_id = v_tenant AND sku = trim(p_sku)) THEN
    RAISE EXCEPTION 'producto_inexistente' USING ERRCODE = 'P0002',
      HINT = 'Cree primero el producto con api.guardar_producto.';
  END IF;

  INSERT INTO core.precio (tenant_id, sku, lista, precio_unidad, precio_caja,
                           precio_kilo, vigente_desde, origen)
  VALUES (v_tenant, trim(p_sku), COALESCE(p_lista,'general'),
          p_precio_unidad, p_precio_caja, p_precio_kilo,
          COALESCE(p_vigente_desde, current_date), 'dashboard')
  ON CONFLICT (tenant_id, sku, lista, vigente_desde) DO UPDATE SET
     precio_unidad = EXCLUDED.precio_unidad,
     precio_caja   = EXCLUDED.precio_caja,
     precio_kilo   = EXCLUDED.precio_kilo,
     origen        = 'dashboard';
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION api.guardar_costo(
  p_sku TEXT, p_costo NUMERIC, p_vigente_desde DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.puede('ver_costo') THEN
    RAISE EXCEPTION 'sin_permiso_costo' USING ERRCODE = '42501';
  END IF;
  IF p_costo IS NULL OR p_costo < 0 THEN
    RAISE EXCEPTION 'costo_invalido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.costo (tenant_id, sku, costo_unitario, vigente_desde, origen)
  VALUES (v_tenant, trim(p_sku), p_costo, COALESCE(p_vigente_desde, current_date), 'lista')
  ON CONFLICT (tenant_id, sku, vigente_desde) DO UPDATE SET
     costo_unitario = EXCLUDED.costo_unitario;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION api.guardar_stock(
  p_sku TEXT, p_stock_total NUMERIC,
  p_almacen TEXT DEFAULT 'principal', p_stock_cajas NUMERIC DEFAULT NULL,
  p_fecha_venc DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.stock (tenant_id, sku, almacen, stock_total, stock_cajas,
                          fecha_venc, campos_manuales, actualizado_en)
  VALUES (v_tenant, trim(p_sku), COALESCE(p_almacen,'principal'),
          COALESCE(p_stock_total,0), p_stock_cajas, p_fecha_venc,
          ARRAY['stock_total'], now())
  ON CONFLICT (tenant_id, sku, almacen) DO UPDATE SET
     stock_total = EXCLUDED.stock_total,
     stock_cajas = COALESCE(EXCLUDED.stock_cajas, core.stock.stock_cajas),
     fecha_venc  = COALESCE(EXCLUDED.fecha_venc,  core.stock.fecha_venc),
     actualizado_en = now();
  RETURN 'ok';
END $$;

COMMENT ON FUNCTION api.guardar_stock IS
  'El stock manual NO se protege del archivo: la existencia real la sabe
   la bodega, no el dashboard. Editarlo a mano sirve para corregir hoy;
   mañana el archivo manda de nuevo. Es a propósito.';

-- ═══ PRECIO ACORDADO CON UN CLIENTE ═════════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_precio_cliente(
  p_cliente_key TEXT, p_sku TEXT, p_precio NUMERIC,
  p_motivo TEXT DEFAULT NULL, p_vigente_hasta DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_lista NUMERIC;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_precio IS NULL OR p_precio < 0 THEN
    RAISE EXCEPTION 'precio_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(precio_unidad, precio_caja, precio_kilo) INTO v_lista
    FROM core.precio
   WHERE tenant_id = v_tenant AND sku = trim(p_sku) AND vigente_desde <= current_date
   ORDER BY vigente_desde DESC LIMIT 1;

  -- Un precio bajo el costo no se bloquea, pero no pasa desapercibido:
  -- a veces es una decisión comercial y a veces es un cero de más.
  IF EXISTS (SELECT 1 FROM core.costo c
              WHERE c.tenant_id = v_tenant AND c.sku = trim(p_sku)
                AND c.vigente_desde <= current_date
                AND c.costo_unitario > p_precio
              ORDER BY c.vigente_desde DESC LIMIT 1) THEN
    RAISE WARNING 'El precio acordado queda BAJO EL COSTO de %', p_sku;
  END IF;

  INSERT INTO core.precio_cliente (tenant_id, cliente_key, sku, precio_unidad,
                                   motivo, vigente_hasta, creado_por)
       VALUES (v_tenant, trim(p_cliente_key), trim(p_sku), p_precio,
               p_motivo, p_vigente_hasta, platform.usuario_actual())
  ON CONFLICT (tenant_id, cliente_key, sku, vigente_desde) DO UPDATE
    SET precio_unidad = EXCLUDED.precio_unidad,
        motivo = EXCLUDED.motivo,
        vigente_hasta = EXCLUDED.vigente_hasta;

  RETURN CASE WHEN v_lista IS NULL THEN 'guardado'
              ELSE format('guardado · %s%% bajo lista',
                          round(100 * (v_lista - p_precio) / v_lista, 1)) END;
END $$;

CREATE OR REPLACE FUNCTION api.quitar_precio_cliente(p_cliente_key TEXT, p_sku TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  -- Se cierra la vigencia, no se borra: hay que poder explicar qué
  -- precio estuvo vigente cuando se emitió una factura vieja.
  UPDATE core.precio_cliente SET vigente_hasta = current_date - 1
   WHERE tenant_id = platform.tenant_actual()
     AND cliente_key = p_cliente_key AND sku = p_sku
     AND (vigente_hasta IS NULL OR vigente_hasta >= current_date);
  RETURN 'el cliente vuelve a su precio histórico o de lista';
END $$;

-- ═══ VOLVER A DEJAR QUE MANDE EL ARCHIVO ════════════════════════════
CREATE OR REPLACE FUNCTION api.liberar_campo(
  p_objeto TEXT, p_llave TEXT, p_campo TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_objeto = 'cliente' THEN
    UPDATE core.cliente
       SET campos_manuales = array_remove(campos_manuales, p_campo), actualizado_en = now()
     WHERE tenant_id = v_tenant AND cliente_key = p_llave;
  ELSIF p_objeto = 'producto' THEN
    UPDATE core.producto
       SET campos_manuales = array_remove(campos_manuales, p_campo), actualizado_en = now()
     WHERE tenant_id = v_tenant AND sku = p_llave;
  ELSE
    RAISE EXCEPTION 'objeto_no_soportado' USING ERRCODE = '22023';
  END IF;
  RETURN 'liberado';
END $$;

COMMENT ON FUNCTION api.liberar_campo(TEXT, TEXT, TEXT) IS
  'Quita la marca manual: a partir de la próxima carga ese campo vuelve
   a salir del archivo. Es cómo se cierra un conflicto a favor del ERP.';

CREATE OR REPLACE FUNCTION api.resolver_conflicto(
  p_conflicto BIGINT, p_resolucion TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, ingest, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); c ingest.conflicto%ROWTYPE;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM ingest.conflicto
   WHERE id = p_conflicto AND tenant_id = v_tenant AND resuelto_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'conflicto_no_encontrado' USING ERRCODE = 'P0002'; END IF;

  IF p_resolucion = 'aceptar_archivo' THEN
    -- Se libera el campo y se aplica lo que traía el archivo.
    IF c.objeto = 'core.cliente' THEN
      UPDATE core.cliente SET campos_manuales = array_remove(campos_manuales, c.campo)
       WHERE tenant_id = v_tenant AND cliente_key = c.llave;
      EXECUTE format('UPDATE core.cliente SET %I = $1, actualizado_en = now()
                       WHERE tenant_id = $2 AND cliente_key = $3', c.campo)
        USING c.valor_archivo, v_tenant, c.llave;
    END IF;
  END IF;

  UPDATE ingest.conflicto SET resuelto_en = now(), resolucion = p_resolucion
   WHERE id = p_conflicto;
  RETURN p_resolucion;
END $$;

-- ═══ VISTAS DEL DASHBOARD ═══════════════════════════════════════════
CREATE OR REPLACE VIEW api.conflictos
WITH (security_invoker = true) AS
SELECT c.id, c.tenant_id, c.lote_id, a.nombre_original AS archivo,
       c.objeto, c.llave, c.campo, c.valor_archivo, c.valor_manual, c.creado_en
  FROM ingest.conflicto c
  JOIN ingest.lote l   ON l.id = c.lote_id
  JOIN ingest.archivo a ON a.id = l.archivo_id
 WHERE c.resuelto_en IS NULL;

CREATE OR REPLACE VIEW api.prospectos
WITH (security_invoker = true) AS
SELECT c.tenant_id, c.cliente_key, c.nombre, c.ejecutivo_id, c.zona_id,
       c.comuna, c.direccion, c.rubro, c.lat, c.lng, c.actualizado_en
  FROM core.cliente c
 WHERE c.es_prospecto AND c.activo;

GRANT SELECT ON api.conflictos, api.prospectos TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.guardar_cliente(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,BOOLEAN,BOOLEAN)',
    'api.guardar_prospecto(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC)',
    'api.convertir_prospecto(TEXT)',
    'api.guardar_producto(TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,BOOLEAN)',
    'api.guardar_precio(TEXT,NUMERIC,NUMERIC,NUMERIC,DATE,TEXT)',
    'api.guardar_costo(TEXT,NUMERIC,DATE)',
    'api.guardar_stock(TEXT,NUMERIC,TEXT,NUMERIC,DATE)',
    'api.liberar_campo(TEXT,TEXT,TEXT)',
    'api.resolver_conflicto(BIGINT,TEXT)',
    'api.guardar_precio_cliente(TEXT,TEXT,NUMERIC,TEXT,DATE)',
    'api.quitar_precio_cliente(TEXT,TEXT)',
    'api.precios_cliente(TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;


-- ███ 027_identidad.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 027 · PUENTE DE IDENTIDAD · sin esto nadie puede entrar
--
-- EL PROBLEMA
-- Toda la seguridad depende de que el token traiga `tenant_id`.
-- Supabase Auth no lo pone solo. Un usuario recién creado entra, su
-- token no trae tenant, `tenant_actual()` devuelve NULL, la RLS le
-- niega todo y ve una app vacía sin entender por qué.
--
-- LA SOLUCIÓN: un hook de token. Supabase llama a esta función cada vez
-- que emite un JWT y ella agrega los claims LEYENDO LA BASE.
--
-- Por qué importa que sea así y no `app_metadata` a mano:
--   · Se revoca solo. Desactivar una membresía quita el acceso en el
--     siguiente refresh, sin editar usuarios uno por uno.
--   · No hay forma de que el cliente se asigne otro tenant: el claim
--     no viaja desde el navegador, lo escribe el servidor en cada emisión.
--
-- Configurar en Supabase → Authentication → Hooks →
--   Custom Access Token: platform.custom_access_token_hook
-- ═══════════════════════════════════════════════════════════════════

-- ─── Superadmin · el arranque ──────────────────────────────────────
-- Tabla y no claim editable: el primer superadmin se inserta UNA vez
-- desde el SQL Editor y de ahí en adelante todo se hace por la app.
CREATE TABLE IF NOT EXISTS platform.superadmin (
  usuario_id UUID PRIMARY KEY,
  email      TEXT NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota       TEXT
);

COMMENT ON TABLE platform.superadmin IS
  'Quién opera la plataforma. Se siembra a mano una sola vez:
     INSERT INTO platform.superadmin (usuario_id, email)
     SELECT id, email FROM auth.users WHERE email = ''tu@correo.cl'';
   Sin esta fila, ni siquiera vos podés dar de alta una empresa.';

ALTER TABLE platform.superadmin ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.superadmin FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS superadmin_lectura ON platform.superadmin;
CREATE POLICY superadmin_lectura ON platform.superadmin FOR SELECT
  USING (platform.es_superadmin());

-- ─── es_superadmin ahora también mira la tabla ─────────────────────
CREATE OR REPLACE FUNCTION platform.es_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(platform.jwt() -> 'app_metadata' ->> 'rol_plataforma', '') = 'superadmin'
      OR COALESCE(platform.jwt() ->> 'rol_plataforma', '') = 'superadmin'
      OR EXISTS (SELECT 1 FROM platform.superadmin s
                  WHERE s.usuario_id = platform.usuario_actual());
$$;
REVOKE ALL ON FUNCTION platform.es_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.es_superadmin() TO authenticated;

-- ─── El hook ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE
  v_uid UUID := (event ->> 'user_id')::uuid;
  v_claims JSONB := COALESCE(event -> 'claims', '{}'::jsonb);
  v_tenant UUID; v_rol TEXT; v_super BOOLEAN;
BEGIN
  SELECT m.tenant_id, m.rol INTO v_tenant, v_rol
    FROM platform.membresias m
    JOIN platform.tenants t ON t.id = m.tenant_id
   WHERE m.usuario_id = v_uid AND m.activo AND t.activo
   ORDER BY m.creado_en
   LIMIT 1;

  SELECT EXISTS (SELECT 1 FROM platform.superadmin s WHERE s.usuario_id = v_uid)
    INTO v_super;

  IF v_tenant IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text));
    v_claims := jsonb_set(v_claims, '{rol}',       to_jsonb(v_rol));
  END IF;
  IF v_super THEN
    v_claims := jsonb_set(v_claims, '{rol_plataforma}', '"superadmin"'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END $$;

COMMENT ON FUNCTION platform.custom_access_token_hook(JSONB) IS
  'Un usuario con varias empresas recibe la más antigua. Cambiar de
   empresa es una función aparte, no un claim que el cliente elija.';

-- El hook lo ejecuta el rol supabase_auth_admin, que sólo existe en
-- Supabase. En una base local se omite este bloque sin ruido: el resto
-- de las migraciones tiene que poder correr y probarse igual.
REVOKE EXECUTE ON FUNCTION platform.custom_access_token_hook(JSONB)
  FROM PUBLIC, authenticated, anon;

DO $hook$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RAISE NOTICE 'supabase_auth_admin no existe (base local): se omiten sus permisos';
    RETURN;
  END IF;

  EXECUTE 'GRANT EXECUTE ON FUNCTION platform.custom_access_token_hook(JSONB) TO supabase_auth_admin';
  EXECUTE 'GRANT USAGE ON SCHEMA platform TO supabase_auth_admin';
  EXECUTE 'GRANT SELECT ON platform.membresias, platform.tenants, platform.superadmin TO supabase_auth_admin';

  -- El hook lee estas tablas y la RLS lo bloquearía. Se le abre SÓLO
  -- lectura y SÓLO sobre lo que necesita para armar los claims.
  EXECUTE 'DROP POLICY IF EXISTS auth_admin_lee_membresias ON platform.membresias';
  EXECUTE 'CREATE POLICY auth_admin_lee_membresias ON platform.membresias FOR SELECT TO supabase_auth_admin USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS auth_admin_lee_tenants ON platform.tenants';
  EXECUTE 'CREATE POLICY auth_admin_lee_tenants ON platform.tenants FOR SELECT TO supabase_auth_admin USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS auth_admin_lee_superadmin ON platform.superadmin';
  EXECUTE 'CREATE POLICY auth_admin_lee_superadmin ON platform.superadmin FOR SELECT TO supabase_auth_admin USING (true)';
END $hook$;

-- ─── auth.users → platform.usuarios ────────────────────────────────
CREATE OR REPLACE FUNCTION platform.fn_sincronizar_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  INSERT INTO platform.usuarios (id, email, nombre)
       VALUES (NEW.id, NEW.email,
               COALESCE(NEW.raw_user_meta_data ->> 'nombre',
                        NEW.raw_user_meta_data ->> 'full_name'))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nombre = COALESCE(EXCLUDED.nombre, platform.usuarios.nombre);
  RETURN NEW;
END $$;

-- Es SECURITY DEFINER porque escribe en platform.usuarios, que tiene
-- RLS. Sólo la llama el trigger de auth.users: nadie más debe poder
-- ejecutarla, o alguien podría insertarse una ficha de usuario.
REVOKE ALL ON FUNCTION platform.fn_sincronizar_usuario() FROM PUBLIC;

COMMENT ON FUNCTION platform.fn_sincronizar_usuario() IS
  'auth.users es de Supabase; platform.usuarios es nuestro. El trigger
   los mantiene juntos. Sin esto hay que copiar cada UUID a mano y a la
   tercera empresa alguien se equivoca.';

DO $$
BEGIN
  -- auth.users sólo existe en Supabase. En local se omite sin ruido.
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='auth' AND tablename='users') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS tg_sincronizar_usuario ON auth.users';
    EXECUTE 'CREATE TRIGGER tg_sincronizar_usuario
               AFTER INSERT OR UPDATE OF email ON auth.users
               FOR EACH ROW EXECUTE FUNCTION platform.fn_sincronizar_usuario()';
  END IF;
END $$;

-- ─── Invitar a alguien a la empresa ────────────────────────────────
-- El usuario se crea en Supabase Auth (invitación por correo); esta
-- función lo enlaza con la empresa y con su ficha de ejecutivo.
CREATE OR REPLACE FUNCTION api.invitar_usuario(
  p_email TEXT, p_rol TEXT, p_nombre TEXT DEFAULT NULL,
  p_ejecutivo_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_uid UUID;
BEGIN
  IF NOT platform.puede('gestionar_usuarios') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_rol NOT IN ('tenant_admin','gerencia','ejecutivo','solo_lectura') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_uid FROM platform.usuarios WHERE lower(email) = lower(trim(p_email));
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_no_registrado' USING ERRCODE = 'P0002',
      HINT = 'Invítalo primero desde Supabase → Authentication → Invite user. '
             'Cuando acepte, vuelve a ejecutar esto.';
  END IF;

  INSERT INTO platform.membresias (usuario_id, tenant_id, rol)
       VALUES (v_uid, v_tenant, p_rol)
  ON CONFLICT (usuario_id, tenant_id) DO UPDATE SET rol = EXCLUDED.rol, activo = TRUE;

  IF p_ejecutivo_id IS NOT NULL THEN
    UPDATE core.ejecutivo SET usuario_id = v_uid, email = p_email
     WHERE tenant_id = v_tenant AND id = p_ejecutivo_id;
  END IF;

  RETURN 'listo · el acceso se aplica cuando vuelva a iniciar sesión';
END $$;

REVOKE ALL ON FUNCTION api.invitar_usuario(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.invitar_usuario(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ███ 028_api_terreno.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 028 · API DE TERRENO
--
-- Lo que la app del vendedor puede escribir. Todo lleva `client_op_id`
-- (D-13): el teléfono genera el UUID y el servidor aplica ON CONFLICT
-- DO NOTHING. Reintentar diez veces produce UN registro.
--
-- El ejecutivo sólo toca SU cartera. No es un filtro en la pantalla:
-- estas funciones lo verifican contra core.ejecutivo antes de escribir.
-- ═══════════════════════════════════════════════════════════════════

/** ¿Este cliente es del ejecutivo que está pidiendo? */
CREATE OR REPLACE FUNCTION core.es_mi_cliente(p_cliente_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.cliente c
     WHERE c.tenant_id = platform.tenant_actual()
       AND c.cliente_key = p_cliente_key
       AND (
         -- gerencia y administración ven toda la cartera
         platform.puede('ver_gerencia')
         OR c.ejecutivo_id IN (
           SELECT e.id FROM core.ejecutivo e
            WHERE e.tenant_id = c.tenant_id
              AND e.usuario_id = platform.usuario_actual()
         )
       )
  );
$$;
REVOKE ALL ON FUNCTION core.es_mi_cliente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.es_mi_cliente(TEXT) TO authenticated;

/** El código de ejecutivo del usuario de la sesión. */
CREATE OR REPLACE FUNCTION core.mi_ejecutivo()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
  SELECT e.id FROM core.ejecutivo e
   WHERE e.tenant_id = platform.tenant_actual()
     AND e.usuario_id = platform.usuario_actual()
     AND e.activo
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION core.mi_ejecutivo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.mi_ejecutivo() TO authenticated;

-- ─── Visita ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.registrar_visita(
  p_client_op_id UUID, p_cliente_key TEXT,
  p_estado TEXT DEFAULT 'visitada', p_resultado TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID; v_eje TEXT;
BEGIN
  IF NOT platform.puede('registrar_visita') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  v_eje := COALESCE(core.mi_ejecutivo(),
                    (SELECT ejecutivo_id FROM core.cliente
                      WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key));

  INSERT INTO core.visita (tenant_id, client_op_id, cliente_key, ejecutivo_id,
                           estado, resultado)
       VALUES (v_tenant, p_client_op_id, p_cliente_key, v_eje, p_estado, p_resultado)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN   -- ya estaba: el reintento devuelve lo mismo
    SELECT id INTO v_id FROM core.visita
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Check-in ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.registrar_checkin(
  p_client_op_id UUID, p_cliente_key TEXT,
  p_lat DOUBLE PRECISION DEFAULT NULL, p_lng DOUBLE PRECISION DEFAULT NULL,
  p_precision_m NUMERIC DEFAULT NULL, p_visita_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID;
        v_eje TEXT; v_dist NUMERIC; v_lat DOUBLE PRECISION; v_lng DOUBLE PRECISION;
BEGIN
  IF NOT platform.puede('registrar_visita') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  -- El GPS del trabajador es dato personal: se guarda sólo si la
  -- empresa tiene contratada la verificación por posición (021).
  IF NOT platform.capacidad_activa('checkin_gps') THEN
    p_lat := NULL; p_lng := NULL; p_precision_m := NULL;
  END IF;

  SELECT lat, lng INTO v_lat, v_lng FROM core.cliente
   WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key;

  -- Distancia aproximada en metros. Sirve para marcar el check-in como
  -- verificado, no para vigilar a nadie.
  IF p_lat IS NOT NULL AND v_lat IS NOT NULL THEN
    v_dist := 6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(v_lat)) * cos(radians(p_lat)) *
      cos(radians(p_lng) - radians(v_lng)) +
      sin(radians(v_lat)) * sin(radians(p_lat)))));
  END IF;

  v_eje := core.mi_ejecutivo();

  INSERT INTO core.checkin (tenant_id, client_op_id, visita_id, cliente_key,
                            ejecutivo_id, lat, lng, precision_m, distancia_m, verificado)
       VALUES (v_tenant, p_client_op_id, p_visita_id, p_cliente_key,
               COALESCE(v_eje, '?'), p_lat, p_lng, p_precision_m, v_dist,
               v_dist IS NOT NULL AND v_dist <= 200)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM core.checkin
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Nota ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.registrar_nota(
  p_client_op_id UUID, p_cliente_key TEXT, p_texto TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID;
BEGIN
  IF NOT platform.puede('registrar_visita') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_texto),'') IS NULL THEN
    RAISE EXCEPTION 'nota_vacia' USING ERRCODE = '22023';
  END IF;

  INSERT INTO core.nota_cliente (tenant_id, client_op_id, cliente_key,
                                 ejecutivo_id, texto)
       VALUES (v_tenant, p_client_op_id, p_cliente_key,
               COALESCE(core.mi_ejecutivo(), '?'), trim(p_texto))
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM core.nota_cliente
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Pedido ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.crear_pedido(
  p_client_op_id UUID, p_cliente_key TEXT, p_lineas JSONB,
  p_nota TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID; v_total NUMERIC;
BEGIN
  IF NOT platform.puede('crear_pedido') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'pedido_vacio' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM core.cliente
              WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key
                AND es_bloqueado) THEN
    RAISE EXCEPTION 'cliente_bloqueado' USING ERRCODE = '42501',
      HINT = 'Este cliente está bloqueado en la maestra.';
  END IF;

  -- El precio lo pone el SERVIDOR. Lo que manda el teléfono es una
  -- intención: el vendedor pudo haber cargado la app hace tres horas.
  SELECT COALESCE(sum((l->>'cantidad')::numeric * COALESCE(pp.precio, 0)), 0)
    INTO v_total
    FROM jsonb_array_elements(p_lineas) l
    CROSS JOIN LATERAL core.precio_para_cliente(v_tenant, p_cliente_key, l->>'sku') pp;

  INSERT INTO core.pedido (tenant_id, client_op_id, cliente_key, ejecutivo_id,
                           origen, lineas, nota, total_estimado)
       VALUES (v_tenant, p_client_op_id, p_cliente_key, core.mi_ejecutivo(),
               'app', p_lineas, p_nota, v_total)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM core.pedido
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Lo que lee el vendedor ────────────────────────────────────────
CREATE OR REPLACE VIEW api.mi_cartera
WITH (security_invoker = true) AS
SELECT c.*
  FROM api.cartera c
 WHERE c.ejecutivo_id = core.mi_ejecutivo()
    OR platform.puede('ver_gerencia');

CREATE OR REPLACE VIEW api.mis_pedidos
WITH (security_invoker = true) AS
SELECT p.id, p.tenant_id, p.cliente_key, c.nombre AS cliente, p.estado,
       p.origen, p.lineas, p.total_estimado, p.nota, p.creado_en
  FROM core.pedido p
  LEFT JOIN core.cliente c
    ON c.tenant_id = p.tenant_id AND c.cliente_key = p.cliente_key
 WHERE p.ejecutivo_id = core.mi_ejecutivo()
    OR platform.puede('ver_gerencia');

GRANT SELECT ON api.mi_cartera, api.mis_pedidos TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.registrar_visita(UUID,TEXT,TEXT,TEXT)',
    'api.registrar_checkin(UUID,TEXT,DOUBLE PRECISION,DOUBLE PRECISION,NUMERIC,UUID)',
    'api.registrar_nota(UUID,TEXT,TEXT)',
    'api.crear_pedido(UUID,TEXT,JSONB,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;


-- ███ 029_control_center.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 029 · CONTROL CENTER · lo que opera Black Sheep
--
-- Todo acá es SECURITY DEFINER y verifica es_superadmin() adentro.
-- Convención: se llaman admin_*, que es la excepción declarada del
-- diagnóstico para funciones que reciben tenant por parámetro (019).
--
-- Estas funciones cruzan el límite entre empresas a propósito: son las
-- ÚNICAS que pueden. Por eso cada una empieza por la misma línea.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Estado del negocio ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_resumen()
RETURNS TABLE (
  empresas BIGINT, operando BIGINT, en_prueba BIGINT, morosas BIGINT,
  suspendidas BIGINT, por_vencer BIGINT, ingreso_mensual NUMERIC,
  usuarios BIGINT, cargas_30d BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, ingest AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    count(*),
    count(*) FILTER (WHERE platform.tenant_habilitado(t.id)),
    count(*) FILTER (WHERE s.estado = 'trial'),
    count(*) FILTER (WHERE s.estado = 'morosa'),
    count(*) FILTER (WHERE s.estado IN ('suspendida','cancelada')),
    -- Lo que hay que llamar esta semana: vence en 7 días o menos y
    -- todavía está operando.
    count(*) FILTER (WHERE s.vigente_hasta <= current_date + 7
                       AND s.estado IN ('trial','activa')),
    COALESCE(sum(s.monto_mensual) FILTER (WHERE s.estado = 'activa'), 0),
    (SELECT count(*) FROM platform.membresias WHERE activo),
    (SELECT count(*) FROM ingest.archivo WHERE subido_en > now() - interval '30 days')
  FROM platform.tenants t
  LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id;
END $$;

-- ─── Ficha de una empresa ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_empresa(p_tenant UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, core, ingest AS $$
DECLARE v JSONB;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'tenant_id', t.id, 'slug', t.slug, 'nombre', t.nombre,
    'color', t.color, 'logo_url', t.logo_url, 'activo', t.activo,
    'creado_en', t.creado_en,
    'suscripcion', to_jsonb(s) - 'tenant_id',
    'habilitado', platform.tenant_habilitado(t.id),
    'capacidades', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'codigo', c.codigo, 'nombre', c.nombre, 'descripcion', c.descripcion,
        'activa', COALESCE(tc.activa, c.activa_por_defecto)) ORDER BY c.codigo), '[]')
        FROM platform.capacidad c
        LEFT JOIN platform.tenant_capacidad tc
          ON tc.tenant_id = t.id AND tc.capacidad = c.codigo),
    'usuarios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'usuario_id', u.id, 'email', u.email, 'nombre', u.nombre,
        'rol', m.rol, 'activo', m.activo) ORDER BY m.rol, u.email), '[]')
        FROM platform.membresias m
        JOIN platform.usuarios u ON u.id = m.usuario_id
       WHERE m.tenant_id = t.id),
    'documentos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'codigo', td.codigo, 'descripcion', td.descripcion,
        'cuenta', td.cuenta_como_venta, 'signo', td.signo) ORDER BY td.codigo), '[]')
        FROM core.tipo_documento td WHERE td.tenant_id = t.id),
    'datos', jsonb_build_object(
      'clientes',  (SELECT count(*) FROM core.cliente  WHERE tenant_id = t.id AND activo),
      'productos', (SELECT count(*) FROM core.producto WHERE tenant_id = t.id AND activo),
      'ventas',    (SELECT count(*) FROM core.venta_linea WHERE tenant_id = t.id),
      'venta_mtd', (SELECT COALESCE(sum(monto_neto),0) FROM core.venta_linea
                     WHERE tenant_id = t.id
                       AND fecha >= date_trunc('month', current_date)::date)),
    'cargas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'archivo', a.nombre_original, 'tipo', a.tipo,
        'estado', l.estado, 'cuando', a.subido_en) ORDER BY a.subido_en DESC), '[]')
        FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
       WHERE l.tenant_id = t.id
       LIMIT 8),
    'pagos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'periodo', p.periodo, 'monto', p.monto, 'referencia', p.referencia,
        'pagado_en', p.pagado_en) ORDER BY p.periodo DESC), '[]')
        FROM platform.pago p WHERE p.tenant_id = t.id LIMIT 12)
  ) INTO v
  FROM platform.tenants t
  LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id
  WHERE t.id = p_tenant;

  IF v IS NULL THEN
    RAISE EXCEPTION 'empresa_no_encontrada' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END $$;

COMMENT ON FUNCTION api.admin_empresa(UUID) IS
  'Una llamada, la ficha completa. Diez consultas separadas desde el
   front serían diez viajes y diez oportunidades de mostrar la mitad de
   la pantalla mientras el resto carga.';

-- ─── Usuarios de una empresa ───────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_asignar_usuario(
  p_tenant UUID, p_email TEXT, p_rol TEXT, p_ejecutivo_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
DECLARE v_uid UUID;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_rol NOT IN ('tenant_admin','gerencia','ejecutivo','solo_lectura') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_uid FROM platform.usuarios WHERE lower(email) = lower(trim(p_email));
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_no_registrado' USING ERRCODE = 'P0002',
      HINT = 'Invítalo desde Supabase → Authentication → Invite user. '
             'Cuando acepte la invitación, vuelve a asignarlo acá.';
  END IF;

  INSERT INTO platform.membresias (usuario_id, tenant_id, rol)
       VALUES (v_uid, p_tenant, p_rol)
  ON CONFLICT (usuario_id, tenant_id) DO UPDATE
    SET rol = EXCLUDED.rol, activo = TRUE;

  IF p_ejecutivo_id IS NOT NULL THEN
    UPDATE core.ejecutivo SET usuario_id = v_uid, email = p_email
     WHERE tenant_id = p_tenant AND id = p_ejecutivo_id;
  END IF;

  -- El claim se arma al emitir el token: el acceso cambia cuando la
  -- persona vuelve a entrar, no al instante.
  RETURN 'asignado · se aplica en su próximo inicio de sesión';
END $$;

CREATE OR REPLACE FUNCTION api.admin_quitar_usuario(p_tenant UUID, p_usuario UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  -- Se desactiva, no se borra: la auditoría tiene que poder decir quién
  -- publicó aquel lote de marzo.
  UPDATE platform.membresias SET activo = FALSE
   WHERE tenant_id = p_tenant AND usuario_id = p_usuario;
  RETURN 'sin acceso desde su próximo inicio de sesión';
END $$;

-- ─── Tipos de documento · el paso que bloquea el onboarding ────────
CREATE OR REPLACE FUNCTION api.admin_configurar_documentos(
  p_tenant UUID, p_documentos JSONB
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_documentos) <> 'array' OR jsonb_array_length(p_documentos) = 0 THEN
    RAISE EXCEPTION 'sin_documentos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO core.tipo_documento (tenant_id, codigo, descripcion, cuenta_como_venta, signo)
  SELECT p_tenant, upper(trim(d->>'codigo')), d->>'descripcion',
         COALESCE((d->>'cuenta')::boolean, true),
         COALESCE((d->>'signo')::smallint, 1)
    FROM jsonb_array_elements(p_documentos) d
   WHERE NULLIF(trim(d->>'codigo'),'') IS NOT NULL
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET descripcion = EXCLUDED.descripcion,
        cuenta_como_venta = EXCLUDED.cuenta_como_venta,
        signo = EXCLUDED.signo;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n || ' tipos configurados';
END $$;

COMMENT ON FUNCTION api.admin_configurar_documentos(UUID, JSONB) IS
  'SIN ESTO LA VENTA QUEDA EN CERO. Es el paso que hay que hacer antes
   de la primera carga de cualquier empresa: decidir qué código de
   documento suma, cuál resta y cuál no cuenta.';

CREATE OR REPLACE FUNCTION api.admin_estado_excluido(
  p_tenant UUID, p_estados TEXT[]
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  DELETE FROM core.estado_excluido WHERE tenant_id = p_tenant;
  INSERT INTO core.estado_excluido (tenant_id, estado)
  SELECT p_tenant, upper(trim(e)) FROM unnest(p_estados) e
   WHERE NULLIF(trim(e),'') IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN 'listo';
END $$;

-- ─── Marca de la empresa ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_marca(
  p_tenant UUID, p_nombre TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL, p_logo_url TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.tenants
     SET nombre = COALESCE(p_nombre, nombre),
         color = COALESCE(p_color, color),
         logo_url = COALESCE(p_logo_url, logo_url)
   WHERE id = p_tenant;
  RETURN 'listo';
END $$;

-- ─── Marca pública por subdominio ──────────────────────────────────
-- La abre alguien SIN sesión: es la pantalla de acceso de cada empresa.
-- Devuelve sólo lo que se pinta. Nada de datos, nada de conteos.
CREATE OR REPLACE FUNCTION api.marca_por_slug(p_slug TEXT)
RETURNS TABLE (slug TEXT, nombre TEXT, color TEXT, logo_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT t.slug, t.nombre, t.color, t.logo_url
    FROM platform.tenants t
   WHERE t.slug = lower(trim(p_slug)) AND t.activo;
$$;

COMMENT ON FUNCTION api.marca_por_slug(TEXT) IS
  'Pública a propósito: el logo y el color de una empresa no son un
   secreto, y sin esto la pantalla de acceso se pinta genérica y después
   salta a la marca. Devuelve CUATRO campos y ninguno es dato de negocio.';

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.admin_resumen()',
    'api.admin_empresa(UUID)',
    'api.admin_asignar_usuario(UUID,TEXT,TEXT,TEXT)',
    'api.admin_quitar_usuario(UUID,UUID)',
    'api.admin_configurar_documentos(UUID,JSONB)',
    'api.admin_estado_excluido(UUID,TEXT[])',
    'api.admin_marca(UUID,TEXT,TEXT,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION api.marca_por_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.marca_por_slug(TEXT) TO anon, authenticated;


-- ███ 030_ciclo_vida.sql ███

-- ═══════════════════════════════════════════════════════════════════
-- 030 · CICLO DE VIDA DEL TENANT
--
-- Una empresa que se va NO se borra. Se archiva.
--
--   trial → activa → morosa → suspendida → cancelada → archivada
--
-- Cada estado tiene un comportamiento distinto y está declarado, no
-- repartido en ifs por la aplicación.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE platform.suscripcion DROP CONSTRAINT IF EXISTS suscripcion_estado_check;
ALTER TABLE platform.suscripcion
  ADD CONSTRAINT suscripcion_estado_check CHECK (estado IN
    ('trial','activa','morosa','suspendida','cancelada','archivada'));

ALTER TABLE platform.suscripcion
  ADD COLUMN IF NOT EXISTS cancelada_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivada_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_baja   TEXT;

-- Catálogo del ciclo. Existe para que el comportamiento de cada estado
-- se pueda LEER, en vez de deducirlo del código.
CREATE TABLE IF NOT EXISTS platform.estado_suscripcion (
  estado      TEXT PRIMARY KEY,
  orden       SMALLINT NOT NULL,
  opera       BOOLEAN NOT NULL,
  descripcion TEXT NOT NULL,
  que_pasa    TEXT NOT NULL
);

INSERT INTO platform.estado_suscripcion (estado, orden, opera, descripcion, que_pasa) VALUES
 ('trial',      1, TRUE,  'En prueba',
  'Opera completo. Vence en la fecha acordada.'),
 ('activa',     2, TRUE,  'Al día',
  'Opera completo.'),
 ('morosa',     3, TRUE,  'Con pago atrasado',
  'Sigue operando durante los días de gracia. Después deja de ver datos sola.'),
 ('suspendida', 4, FALSE, 'Cortada por impago',
  'Sus usuarios no ven datos. NADA se borra: vuelve entera al registrar el pago.'),
 ('cancelada',  5, FALSE, 'Se dio de baja',
  'Sin acceso operativo. Se conservan empresa, usuarios, datos, auditoría y pagos.'),
 ('archivada',  6, FALSE, 'Fuera de operación, conservada',
  'Ni siquiera aparece en las listas del día a día. Los datos siguen intactos y se puede reactivar.')
ON CONFLICT (estado) DO UPDATE
  SET orden = EXCLUDED.orden, opera = EXCLUDED.opera,
      descripcion = EXCLUDED.descripcion, que_pasa = EXCLUDED.que_pasa;

ALTER TABLE platform.estado_suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.estado_suscripcion FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estado_lectura ON platform.estado_suscripcion;
CREATE POLICY estado_lectura ON platform.estado_suscripcion FOR SELECT USING (true);
GRANT SELECT ON platform.estado_suscripcion TO authenticated;

-- ─── El interruptor lee el catálogo ────────────────────────────────
-- Antes la lista de estados que operan estaba escrita dentro de la
-- función. Ahora sale de la tabla: agregar un estado no obliga a tocar
-- el mecanismo de corte, que es el código más delicado del sistema.
CREATE OR REPLACE FUNCTION platform.tenant_habilitado(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT EXISTS (
    SELECT 1
      FROM platform.tenants t
      JOIN platform.suscripcion s ON s.tenant_id = t.id
      JOIN platform.estado_suscripcion es ON es.estado = s.estado
     WHERE t.id = p_tenant
       AND t.activo
       AND es.opera
       -- Morosa opera sólo mientras dure la gracia.
       AND (s.estado <> 'morosa'
            OR current_date <= s.vigente_hasta + s.dias_gracia)
  );
$$;

COMMENT ON FUNCTION platform.tenant_habilitado(UUID) IS
  'Fail-closed: sin fila de suscripción no hay acceso. Un tenant creado
   a mano sin plan queda cerrado, no abierto.';

-- ─── Baja y archivo ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_dar_de_baja(
  p_tenant UUID, p_motivo TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.suscripcion
     SET estado = 'cancelada', cancelada_en = now(),
         motivo_baja = p_motivo, actualizado_en = now()
   WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_sin_suscripcion' USING ERRCODE = 'P0002';
  END IF;
  RETURN 'dada de baja · sus datos, usuarios y auditoría se conservan';
END $$;

CREATE OR REPLACE FUNCTION api.admin_archivar(p_tenant UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_estado TEXT;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT estado INTO v_estado FROM platform.suscripcion WHERE tenant_id = p_tenant;
  -- Archivar una empresa que todavía opera casi siempre es un clic mal
  -- dado. Hay que darla de baja primero, a propósito.
  IF v_estado NOT IN ('cancelada','suspendida') THEN
    RAISE EXCEPTION 'archivar_requiere_baja' USING ERRCODE = '22023',
      HINT = 'Primero dala de baja o suspéndela.';
  END IF;
  UPDATE platform.suscripcion
     SET estado = 'archivada', archivada_en = now(), actualizado_en = now()
   WHERE tenant_id = p_tenant;
  RETURN 'archivada · los datos quedan intactos y se puede reactivar';
END $$;

COMMENT ON FUNCTION api.admin_archivar(UUID) IS
  'Archivar NO borra nada. Es un estado, no un DELETE. Reactivar es
   registrar un pago o cambiar el estado a activa.';

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.admin_dar_de_baja(UUID,TEXT)',
    'api.admin_archivar(UUID)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;


SELECT control, estado, detalle FROM compliance.diagnostico();
