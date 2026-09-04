-- ═══════════════════════════════════════════════════════════════════
-- 42 · ZONAS CONFIGURABLES POR TENANT
--
-- 🔴 EL PROBLEMA
-- Las zonas NOR-ORIENTE / NOR-PONIENTE / ZONA SUR están escritas a mano
-- en **10 archivos** de código: `zonas.js`, `theme/zones.js`, `App.jsx`,
-- `Ruta.jsx`, `ZoneSegmented.jsx`, `DashboardGerencia.jsx` y sus tests.
--
-- Eso significa que hoy, para agregar un vendedor y pasar a
-- norte/sur/este/oeste, hay que **editar y desplegar código**. Y para
-- vender a una segunda empresa —que va a tener sus propias zonas— habría
-- que mantener una versión del código por cliente.
--
-- Es el bloqueante real de la replicación, más que cualquier detalle
-- visual.
--
-- LA SOLUCIÓN
-- Las zonas pasan a ser DATOS. Gerencia las crea, renombra y colorea
-- desde el dashboard, y la app las lee. El código deja de saber cuántas
-- zonas hay ni cómo se llaman.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zonas (
  id           TEXT PRIMARY KEY,          -- 'NORTE', 'SUR', 'ESTE', 'OESTE'
  nombre       TEXT NOT NULL,             -- lo que se muestra: 'Norte'
  nombre_corto TEXT,                      -- para el selector en móvil
  color        TEXT NOT NULL DEFAULT '#c2410c',
  orden        INT  NOT NULL DEFAULT 0,   -- posición en el selector
  activa       BOOLEAN NOT NULL DEFAULT TRUE,
  es_terreno   BOOLEAN NOT NULL DEFAULT TRUE,  -- false = KAM, Televenta…
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Qué comuna pertenece a qué zona. Antes vivía en un objeto de
-- `zonas.js` con ~50 comunas escritas a mano.
CREATE TABLE IF NOT EXISTS public.zonas_comunas (
  comuna   TEXT PRIMARY KEY,
  zona_id  TEXT NOT NULL REFERENCES public.zonas(id) ON UPDATE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zonas_comunas_zona
  ON public.zonas_comunas (zona_id);

-- ── Semilla: las tres zonas actuales ───────────────────────────────
-- Se insertan sólo si la tabla está vacía, para no pisar una
-- configuración ya hecha.
INSERT INTO public.zonas (id, nombre, nombre_corto, color, orden, es_terreno)
SELECT * FROM (VALUES
  ('NOR-ORIENTE',  'Nor-Oriente',  'NOR-ORIENTE',  '#c2410c', 1, TRUE),
  ('NOR-PONIENTE', 'Nor-Poniente', 'NOR-PONIENTE', '#0d9488', 2, TRUE),
  ('ZONA SUR',     'Zona Sur',     'ZONA SUR',     '#7c3aed', 3, TRUE),
  ('KAM',          'KAM',          'KAM',          '#1d4ed8', 4, FALSE),
  ('TELEVENTA',    'Televenta',    'TELEVENTA',    '#0891b2', 5, FALSE),
  ('CORPORATIVO',  'Corporativo',  'CORPORATIVO',  '#4f46e5', 6, FALSE)
) AS v(id, nombre, nombre_corto, color, orden, es_terreno)
WHERE NOT EXISTS (SELECT 1 FROM public.zonas);

-- ── Metas por zona y por mes ───────────────────────────────────────
-- Para que gerencia pueda cargarlas sin tocar el ciclo.
CREATE TABLE IF NOT EXISTS public.metas_zona (
  zona_id   TEXT NOT NULL REFERENCES public.zonas(id) ON UPDATE CASCADE,
  periodo   DATE NOT NULL,               -- primer día del mes
  meta_clp  NUMERIC NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zona_id, periodo)
);

-- ── Ejecutivos: la zona pasa a ser una referencia ──────────────────
ALTER TABLE public.ejecutivos ADD COLUMN IF NOT EXISTS zona_id TEXT;
ALTER TABLE public.ejecutivos ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

-- Se rellena desde la columna `zona` que ya existía.
UPDATE public.ejecutivos
   SET zona_id = UPPER(TRIM(zona))
 WHERE zona_id IS NULL
   AND zona IS NOT NULL
   AND UPPER(TRIM(zona)) IN (SELECT id FROM public.zonas);

-- ── Seguridad ──────────────────────────────────────────────────────
ALTER TABLE public.zonas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_comunas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_zona    ENABLE ROW LEVEL SECURITY;

-- Todos LEEN las zonas: la app las necesita para el selector.
DROP POLICY IF EXISTS zonas_lectura ON public.zonas;
CREATE POLICY zonas_lectura ON public.zonas
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS zonas_comunas_lectura ON public.zonas_comunas;
CREATE POLICY zonas_comunas_lectura ON public.zonas_comunas
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS metas_lectura ON public.metas_zona;
CREATE POLICY metas_lectura ON public.metas_zona
  FOR SELECT TO authenticated USING (TRUE);

-- Sólo GERENCIA escribe. `using(true)` acá sería un agujero: cualquier
-- vendedor podría renombrar zonas o cambiarse la meta.
DROP POLICY IF EXISTS zonas_escritura ON public.zonas;
CREATE POLICY zonas_escritura ON public.zonas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  );

DROP POLICY IF EXISTS zonas_comunas_escritura ON public.zonas_comunas;
CREATE POLICY zonas_comunas_escritura ON public.zonas_comunas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  );

DROP POLICY IF EXISTS metas_escritura ON public.metas_zona;
CREATE POLICY metas_escritura ON public.metas_zona
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.ejecutivos e
             WHERE e.id = auth.uid()
               AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  );

-- ═══════════════════════════════════════════════════════════════════
-- RENOMBRAR UNA ZONA SIN PERDER NADA
--
-- Cambiar 'NOR-ORIENTE' por 'NORTE' tiene que arrastrar cartera,
-- prospectos, ejecutivos y metas. Si se hace a mano queda a medias y
-- los clientes desaparecen de la vista de su vendedor.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.renombrar_zona(
  p_zona_vieja TEXT,
  p_zona_nueva TEXT,
  p_nombre     TEXT DEFAULT NULL,
  p_color      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cartera    INT := 0;
  v_prospectos INT := 0;
  v_ejecutivos INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ejecutivos e
     WHERE e.id = auth.uid()
       AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sólo gerencia puede cambiar zonas');
  END IF;

  -- La zona destino se crea si no existe
  INSERT INTO public.zonas (id, nombre, nombre_corto, color, orden)
  SELECT p_zona_nueva,
         COALESCE(p_nombre, INITCAP(p_zona_nueva)),
         p_zona_nueva,
         COALESCE(p_color, '#c2410c'),
         COALESCE((SELECT MAX(orden) + 1 FROM public.zonas), 1)
  ON CONFLICT (id) DO NOTHING;

  -- Arrastrar TODO lo que apunta a la zona vieja
  UPDATE public.cartera    SET zona = p_zona_nueva WHERE zona = p_zona_vieja;
  GET DIAGNOSTICS v_cartera = ROW_COUNT;

  UPDATE public.prospectos SET zona = p_zona_nueva WHERE zona = p_zona_vieja;
  GET DIAGNOSTICS v_prospectos = ROW_COUNT;

  UPDATE public.ejecutivos SET zona = p_zona_nueva, zona_id = p_zona_nueva
   WHERE zona = p_zona_vieja;
  GET DIAGNOSTICS v_ejecutivos = ROW_COUNT;

  UPDATE public.zonas_comunas SET zona_id = p_zona_nueva WHERE zona_id = p_zona_vieja;
  UPDATE public.metas_zona    SET zona_id = p_zona_nueva WHERE zona_id = p_zona_vieja;

  -- La vieja se desactiva, no se borra: el histórico la sigue usando.
  UPDATE public.zonas SET activa = FALSE WHERE id = p_zona_vieja;

  RETURN jsonb_build_object(
    'ok', true,
    'cartera', v_cartera,
    'prospectos', v_prospectos,
    'ejecutivos', v_ejecutivos
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO
-- ═══════════════════════════════════════════════════════════════════
SELECT id, nombre, color, orden, activa, es_terreno
FROM public.zonas ORDER BY orden;

SELECT z.id, COUNT(zc.comuna) AS comunas
FROM public.zonas z
LEFT JOIN public.zonas_comunas zc ON zc.zona_id = z.id
GROUP BY z.id ORDER BY z.id;

SELECT zona, COUNT(*) AS ejecutivos
FROM public.ejecutivos GROUP BY zona ORDER BY zona;
