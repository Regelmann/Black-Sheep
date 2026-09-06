-- ═══════════════════════════════════════════════════════════════════
-- 50 · CIMIENTO MULTI-TENANT
--
-- Este archivo es la base para vender la plataforma a más de una
-- empresa. Reemplaza el modelo actual —una instalación por cliente—
-- por uno donde todas conviven aisladas en la misma base.
--
-- ── POR QUÉ ASÍ Y NO DE OTRA FORMA ─────────────────────────────────
--
-- Hay dos maneras de hacer multi-tenant en Postgres:
--
--   a) UN ESQUEMA POR EMPRESA — aislamiento total, pero cada migración
--      hay que correrla N veces y el mantenimiento se vuelve inviable
--      pasados unos pocos clientes.
--
--   b) BASE COMPARTIDA con `tenant_id` en cada tabla + RLS.
--
-- La recomendación consistente para SaaS es (b): sólo conviene el
-- esquema por cliente cuando hay exigencias de cumplimiento
-- específicas. Con (b) una migración se corre una vez y sirve para
-- todos.
--
-- ── LA DECISIÓN QUE MÁS IMPORTA: EL CLAIM EN EL JWT ────────────────
--
-- La política ingenua es esta:
--
--   USING (tenant_id = (SELECT tenant_id FROM ejecutivos
--                        WHERE id = auth.uid()))
--
-- **Y es una trampa de rendimiento.** Esa subconsulta se evalúa POR
-- CADA FILA que el motor escanea. Con 500.000 líneas de venta son
-- 500.000 consultas a `ejecutivos` para responder una sola pregunta.
--
-- El patrón correcto guarda el tenant en el JWT y compara contra un
-- valor constante:
--
--   USING (tenant_id = auth.jwt() ->> 'tenant_id')
--
-- Sin subconsulta, sin join, y con índice: la diferencia es de minutos
-- a milisegundos.
--
-- ── DEFENSA EN PROFUNDIDAD ─────────────────────────────────────────
--
-- El `tenant_id` en el código de la app NO es la barrera de seguridad:
-- es una ayuda para el planificador. La barrera es RLS. Un filtro
-- olvidado en una consulta nueva, un proceso en segundo plano o una
-- consulta ad-hoc no pueden cruzar el límite si la política está.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ═══ 1 · LAS EMPRESAS ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tenants (
  id          TEXT PRIMARY KEY,            -- 'keyfoods', 'otra-empresa'
  nombre      TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#c2410c',
  logo_url    TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  -- Config por empresa: moneda, IVA, días de ciclo por defecto…
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (id, nombre, color)
VALUES ('keyfoods', 'KeyFoods', '#c2410c')
ON CONFLICT (id) DO NOTHING;

-- ═══ 2 · tenant_id EN TODAS LAS TABLAS DE DATOS ════════════════════
-- Se agrega con default 'keyfoods' para que lo que ya existe quede
-- atribuido al primer cliente sin migración manual.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cartera','prospectos','stock','ventas_lineas','pedidos',
    'notas_cliente','checkins','ofertas_cliente','oferta_cliente_items',
    'ejecutivos','gerencia','gerencia_clientes','zonas','zonas_comunas',
    'metas_zona','tendencia','snapshot_meta'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id TEXT
           NOT NULL DEFAULT ''keyfoods''', t);

      -- 🔴 EL ÍNDICE NO ES OPCIONAL.
      -- Una política RLS sin índice sobre la columna que filtra es la
      -- causa número uno de consultas lentas en Supabase: obliga a un
      -- barrido completo en cada consulta.
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_tenant ON public.%I (tenant_id)',
        t, t);
    END IF;
  END LOOP;
END $$;

-- ═══ 3 · EL CLAIM EN EL JWT ════════════════════════════════════════
-- Un hook que Supabase Auth ejecuta al emitir el token: agrega
-- `tenant_id` y `rol` a los claims, para que las políticas los lean
-- sin tocar la base.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_claims JSONB;
  v_tenant TEXT;
  v_rol    TEXT;
BEGIN
  SELECT COALESCE(e.tenant_id, 'keyfoods'), COALESCE(e.rol, 'vendedor')
    INTO v_tenant, v_rol
    FROM public.ejecutivos e
   WHERE e.id = (event->>'user_id')::uuid;

  v_claims := COALESCE(event->'claims', '{}'::jsonb);
  v_claims := jsonb_set(v_claims, '{tenant_id}',
                        to_jsonb(COALESCE(v_tenant, 'keyfoods')));
  v_claims := jsonb_set(v_claims, '{rol}',
                        to_jsonb(COALESCE(v_rol, 'vendedor')));

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- ⚠️ ESTE FALLBACK ES PERMISIVO A PROPÓSITO, PARA LA MIGRACIÓN.
--
-- Devuelve keyfoods cuando no hay claim, para que la instalación
-- actual siga funcionando mientras se activa el hook. Pero para el
-- multi-tenant definitivo eso está MAL: si el claim falta, lo correcto
-- es devolver NULL y que RLS deniegue —fail-closed— en vez de asumir
-- una empresa.
--
--  trae la versión sin fallback.
-- Correr ESE después de verificar que el hook emite el claim.
CREATE OR REPLACE FUNCTION public.tenant_actual()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'tenant_id', ''),
    (SELECT e.tenant_id FROM public.ejecutivos e WHERE e.id = auth.uid()),
    'keyfoods'
  );
$$;

CREATE OR REPLACE FUNCTION public.es_gerencia()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    UPPER(auth.jwt() ->> 'rol') IN ('GERENTE','ADMIN','SUPERADMIN'),
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol,'')) IN ('GERENTE','ADMIN','SUPERADMIN')),
    FALSE
  );
$$;

-- ═══ 4 · LAS POLÍTICAS ═════════════════════════════════════════════
-- Una sola por tabla, sin subconsultas por fila.
--
-- 🔴 ESTO REEMPLAZA LOS 19 `using(true)` que el guard viene marcando
-- desde hace versiones. Con un solo cliente no molestaban; con dos,
-- cada empresa vería los datos de la otra.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cartera','prospectos','stock','ventas_lineas','pedidos',
    'notas_cliente','checkins','ofertas_cliente','oferta_cliente_items',
    'gerencia','gerencia_clientes','zonas','zonas_comunas',
    'metas_zona','tendencia','snapshot_meta'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS aislamiento_tenant ON public.%I', t);
      -- `(SELECT public.tenant_actual())` entre paréntesis: Postgres lo
      -- resuelve UNA vez como InitPlan en vez de por cada fila.
      EXECUTE format($f$
        CREATE POLICY aislamiento_tenant ON public.%I
          FOR ALL TO authenticated
          USING      (tenant_id = (SELECT public.tenant_actual()))
          WITH CHECK (tenant_id = (SELECT public.tenant_actual()))
      $f$, t);
    END IF;
  END LOOP;
END $$;

-- El catálogo público es la excepción: lo abre un cliente SIN sesión,
-- con un token en la URL. El aislamiento ahí lo da el token, no el JWT.
ALTER TABLE public.ofertas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogo_publico_por_token ON public.ofertas_cliente;
CREATE POLICY catalogo_publico_por_token ON public.ofertas_cliente
  FOR SELECT TO anon
  USING (token IS NOT NULL AND activo = TRUE);

-- ═══ 5 · DIAGNÓSTICO ═══════════════════════════════════════════════

-- ¿Qué tablas quedaron sin aislar? Cualquier fila acá es una fuga
-- potencial al sumar el segundo cliente.
SELECT c.table_name,
       CASE WHEN p.policyname IS NULL THEN '❌ SIN POLÍTICA' ELSE '✅' END AS estado
FROM information_schema.columns c
LEFT JOIN pg_policies p
       ON p.tablename = c.table_name AND p.policyname = 'aislamiento_tenant'
WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
ORDER BY estado, c.table_name;

-- ¿Quedan políticas abiertas de los SQL viejos?
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
  AND policyname <> 'catalogo_publico_por_token'
ORDER BY tablename;

-- Reparto de filas por empresa.
SELECT 'cartera' AS tabla, tenant_id, COUNT(*) FROM public.cartera GROUP BY tenant_id
UNION ALL
SELECT 'stock', tenant_id, COUNT(*) FROM public.stock GROUP BY tenant_id
ORDER BY 1, 2;
