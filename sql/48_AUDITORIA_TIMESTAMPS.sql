-- ============================================================
-- 48_AUDITORIA_TIMESTAMPS.sql  ·  v-BS-PLATFORM-V13.2
--
-- updated_at EN LAS ENTIDADES EDITABLES
-- -------------------------------------
-- El caso: un pedido se edita en la app del vendedor Y en el Control
-- Center a la vez. Sin `updated_at` no hay forma de saber que hubo
-- conflicto: gana el último que escribe, sin huella.
--
-- Este archivo agrega la columna y un trigger `before update` a las
-- tablas editables. La columna es `NOT NULL DEFAULT now()` para no
-- romper fils existentes ni inserts que no la mencionen.
--
-- FUENTE ÚNICA: `public.touch_updated_at()` se define UNA vez acá
-- (definirla en otro archivo dejaría versiones viejas vivas en la base).
--
-- ORDEN: después de 47_RLS_CIERRE_FINAL.sql. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cartera', 'stock', 'metas', 'focos', 'ejecutivos', 'prospectos',
    'visitas', 'checkins', 'notas_cliente', 'pedidos', 'ofertas_cliente',
    'oferta_cliente_items', 'gerencia_clientes', 'encuestas_visita',
    'decision_feedback', 'zonas_comunas'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch_updated_at', t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
        t || '_touch_updated_at', t);
    END IF;
  END LOOP;
END $$;

-- Verificación: todas las tablas listadas deben tener updated_at + trigger.
SELECT
  c.relname AS tabla,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=c.relname AND column_name='updated_at')
       THEN '✅ updated_at' ELSE '🔴 sin updated_at' END AS columna,
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = c.oid AND tgname = c.relname || '_touch_updated_at')
       THEN '✅ trigger' ELSE '🔴 sin trigger' END AS trigger_auditoria
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relname IN (
    'cartera', 'stock', 'metas', 'focos', 'ejecutivos', 'prospectos',
    'visitas', 'checkins', 'notas_cliente', 'pedidos', 'ofertas_cliente',
    'oferta_cliente_items', 'gerencia_clientes', 'encuestas_visita',
    'decision_feedback', 'zonas_comunas'
  )
ORDER BY tabla;
-- Todo debe salir '✅'.
