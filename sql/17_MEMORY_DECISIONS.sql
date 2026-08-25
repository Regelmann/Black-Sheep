-- ============================================================
-- 17_MEMORY_DECISIONS.sql
-- Sistema de memoria: aprende qué recomendaciones funcionan
--
-- Flujo:
--   DecisionCard mostrada → ejecutivo actúa → pedido guardado
--   → se registra el outcome → el engine aprende
--
-- Correr UNA VEZ en Supabase SQL Editor
-- ============================================================

-- Tabla de feedback de decisiones
CREATE TABLE IF NOT EXISTS public.decision_feedback (
  id              BIGSERIAL PRIMARY KEY,
  decision_id     TEXT NOT NULL,          -- id del Decision (ej: rep_77665074-9)
  decision_type   TEXT,                   -- replenish | protect | focus | order
  attention       TEXT,                   -- now | today | week
  cliente_key     TEXT,                   -- cliente involucrado
  ejecutivo_id    UUID,
  pedido_id       BIGINT,                 -- pedido resultante (si lo hay)
  accion          TEXT,                   -- 'pedido' | 'contacto' | 'ignorado' | 'visitado'
  total_pedido    NUMERIC DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  fecha_snapshot  DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS df_decision_id_idx ON public.decision_feedback (decision_id);
CREATE INDEX IF NOT EXISTS df_ejecutivo_idx   ON public.decision_feedback (ejecutivo_id);
CREATE INDEX IF NOT EXISTS df_cliente_idx     ON public.decision_feedback (cliente_key);
CREATE INDEX IF NOT EXISTS df_fecha_idx       ON public.decision_feedback (fecha_snapshot);

ALTER TABLE public.decision_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "df_auth" ON public.decision_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vista de efectividad por tipo de decisión
CREATE OR REPLACE VIEW public.decision_effectiveness AS
SELECT
  decision_type,
  attention,
  COUNT(*)                                            AS total_mostradas,
  COUNT(*) FILTER (WHERE accion = 'pedido')           AS con_pedido,
  COUNT(*) FILTER (WHERE accion IN ('pedido','contacto','visitado')) AS con_accion,
  ROUND(
    COUNT(*) FILTER (WHERE accion = 'pedido')::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                   AS pct_conversion_pedido,
  ROUND(
    AVG(total_pedido) FILTER (WHERE total_pedido > 0), 0
  )                                                   AS ticket_promedio,
  MAX(created_at)                                     AS ultima_actualizacion
FROM public.decision_feedback
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY decision_type, attention
ORDER BY pct_conversion_pedido DESC NULLS LAST;

COMMENT ON TABLE public.decision_feedback IS
  'Registro de qué acciones tomó el ejecutivo después de ver cada DecisionCard. Alimenta el motor de aprendizaje.';

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('decision_feedback')
ORDER BY 1;
