-- ============================================================
-- 36_PORTAL_PEDIDOS.sql  ·  v-BS-PLATFORM-V11.2
--
-- Portal B2B de autoservicio (idea #5): historial de pedidos del
-- cliente + recompra en un clic, sobre el catálogo por token.
--
-- POR QUÉ
-- -------
-- El catálogo público es `anon`: el cliente entra por link SIN login. Para
-- convertirlo en un portal tiene que poder ver SUS pedidos y volver a
-- pedirlos. El acceso por RPC SECURITY DEFINER validando el token es la
-- misma mecánica que ya usa el catálogo (get_public_catalogo) y los push
-- (sql/34). El token ES la credencial: el cliente lo guarda en el link.
--
-- QUÉ HACE
-- --------
--   · `get_pedidos_publicos(p_token)` → lista los pedidos del cliente de
--     ese catálogo (los nuevos con fuente 'catalogo_publico'), con sus
--     líneas y total. Aísla por cliente_key de la oferta.
--   · `reordenar_pedido_publico(p_token, p_pedido_id)` → clona un pedido
--     anterior del CLIENTE y lo re-envía revalidando precios server-side
--     (reusa `crear_pedido_publico`). Devuelve el id del nuevo pedido.
--
-- SEGURIDAD
--   · SECURITY DEFINER: corre como owner (el cliente es anon).
--   · Aislamiento: el historial SIEMPRE se resuelve por el `cliente_key` de
--     la oferta del token pedido — nunca por el id que pase el cliente.
--   · `reordenar` verifica que el pedido pertenezca a ESE cliente_key:
--     no se puede clonar el pedido de otra empresa aunque se conozca el id.
--
-- ORDEN: correr DESPUÉS de 21 (crear_pedido_publico) y de 19 (ofertas_cliente).
-- ============================================================

-- ------------------------------------------------------------
-- 1) RPC · HISTORIAL de pedidos del cliente
--    Devuelve JSONB (array de pedidos). Cada pedido trae sus líneas tal
--    como se guardaron (server-side), para que el front pueda mostrarlas
--    y ofrecer "reordenar".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pedidos_publicos(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oferta  public.ofertas_cliente%ROWTYPE;
  v_res     JSONB;
BEGIN
  SELECT * INTO v_oferta
  FROM public.ofertas_cliente
  WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id',           p.id,
      'creado_en',    p.creado_en,
      'estado',       p.estado,
      'fuente',       p.fuente,
      'total',        p.total_estimado,
      'nota',         p.nota,
      'lineas',       p.lineas
    ) ORDER BY p.creado_en DESC),
    '[]'::jsonb
  )
  INTO v_res
  FROM public.pedidos p
  WHERE p.cliente_key = v_oferta.cliente_key
    AND p.fuente = 'catalogo_publico'
    AND p.creado_en >= (NOW() - INTERVAL '180 days');

  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.get_pedidos_publicos(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pedidos_publicos(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 2) RPC · REORDENAR un pedido anterior
--    Reenvía el pedido del cliente revalidando precios/stock en el server.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reordenar_pedido_publico(
  p_token     TEXT,
  p_pedido_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oferta  public.ofertas_cliente%ROWTYPE;
  v_lineas  JSONB;
  v_nuevo   UUID;
BEGIN
  SELECT * INTO v_oferta
  FROM public.ofertas_cliente
  WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;

  -- El pedido debe ser del MISMO cliente_key (aislamiento entre empresas).
  SELECT p.lineas INTO v_lineas
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
    AND p.cliente_key = v_oferta.cliente_key
    AND p.fuente = 'catalogo_publico'
  LIMIT 1;

  IF v_lineas IS NULL OR jsonb_typeof(v_lineas) <> 'array' OR jsonb_array_length(v_lineas) = 0 THEN
    RAISE EXCEPTION 'PEDIDO_NO_REORDENABLE';
  END IF;

  -- Reusa la función canónica: revalida precios, estado y calcula total.
  v_nuevo := public.crear_pedido_publico(v_oferta.token, v_lineas, 'Reordenado desde el portal');

  RETURN v_nuevo;
END $$;

REVOKE ALL ON FUNCTION public.reordenar_pedido_publico(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reordenar_pedido_publico(TEXT, UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) VERIFICACIÓN
-- ------------------------------------------------------------
-- a) Firmas únicas (R8 no debe marcar duplicados)
SELECT
  p.oid::regprocedure AS firma,
  p.prosecdef         AS security_definer,
  CASE WHEN COUNT(*) OVER () = 1 THEN 'OK · firma única' ELSE 'ERROR · sobrecarga' END AS estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_pedidos_publicos','reordenar_pedido_publico')
ORDER BY p.proname;

-- b) Prueba de humo (reemplazar token):
-- SELECT public.get_pedidos_publicos('TOKEN_REAL') LIMIT 1;
