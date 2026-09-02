-- ============================================================
-- 00_VERIFICAR_ESTADO.sql
--
-- Correr ESTO PRIMERO, antes de cualquier migración.
-- No modifica nada. Sólo dice qué hay y qué falta.
--
-- Después de aplicar las migraciones, correrlo de nuevo:
-- todo debe decir OK.
-- ============================================================

-- ── 1 · TABLAS ─────────────────────────────────────────────
SELECT
  t.nombre                                              AS tabla,
  CASE WHEN c.oid IS NULL THEN '❌ FALTA' ELSE '✅ OK' END AS estado,
  t.la_crea                                             AS "script que la crea"
FROM (VALUES
  ('cartera',                 'ETL · CICLO_UNICO.py'),
  ('ejecutivos',              'ETL · CICLO_UNICO.py'),
  ('ventas_lineas',           'ETL · CICLO_UNICO.py'),
  ('gerencia',                'ETL · CICLO_UNICO.py'),
  ('gerencia_clientes',       'ETL · CICLO_UNICO.py'),
  ('stock',                   'ETL · CICLO_UNICO.py'),
  ('snapshot_meta',           'ETL · CICLO_UNICO.py'),
  ('tendencia',               'ETL · CICLO_UNICO.py'),
  ('metas',                   'ETL · CICLO_UNICO.py'),
  ('focos',                   'ETL · CICLO_UNICO.py'),
  ('visitas',                 'app'),
  ('checkins',                'app'),
  ('rutas',                   'app'),
  ('notas_cliente',           'app'),
  ('pedidos',                 '11_ORDER_INBOX_V26'),
  ('prospectos',              '08_PROSPECTOS_RLS'),
  ('encuestas_visita',        '06_ENCUESTAS_VISITA'),
  ('ofertas_cliente',         '19_CATALOGO_OFERTA_CLIENTE'),
  ('oferta_cliente_items',    '19_CATALOGO_OFERTA_CLIENTE'),
  ('decision_feedback',       '17_MEMORY_DECISIONS'),
  ('push_suscripciones',      '37_PUSH_SUSCRIPCIONES'),
  ('push_config',             '38_PUSH_AUTO')
) AS t(nombre, la_crea)
LEFT JOIN pg_class c
  ON c.relname = t.nombre
 AND c.relnamespace = 'public'::regnamespace
 AND c.relkind IN ('r','v','m')
ORDER BY estado DESC, t.nombre;


-- ── 2 · COLUMNAS CRÍTICAS ──────────────────────────────────
-- Si falta alguna, la función canónica correspondiente falla.
SELECT
  x.tabla || '.' || x.columna                              AS columna,
  CASE WHEN c.column_name IS NULL THEN '❌ FALTA' ELSE '✅ OK' END AS estado,
  x.nota
FROM (VALUES
  ('ofertas_cliente','activo',        'NUNCA "activa" — ver 20_CATALOGO_CANONICO'),
  ('ofertas_cliente','token',         'credencial del catálogo público'),
  ('ofertas_cliente','cliente_key',   'FK lógica a cartera'),
  ('pedidos','estado',                '11_ORDER_INBOX_V26'),
  ('pedidos','fuente',                '11_ORDER_INBOX_V26'),
  ('pedidos','total_estimado',        '11_ORDER_INBOX_V26'),
  ('pedidos','lineas',                'jsonb con el detalle'),
  ('pedidos','nota',                  'requerido por crear_pedido_publico'),
  ('checkins','lat_real',             'GPS del check-in'),
  ('checkins','lng_real',             'GPS del check-in'),
  ('stock','precio_unidad',           '07_STOCK_PRECIOS'),
  ('cartera','sku_detalle',           'ETL — sin esto no hay cruce de compradores'),
  ('cartera','es_bloqueado',          'ETL — lo lee Stock y Gerencia')
) AS x(tabla, columna, nota)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name   = x.tabla
 AND c.column_name  = x.columna
ORDER BY estado DESC, columna;


-- ── 3 · COLUMNA FANTASMA `activa` ──────────────────────────
-- Este fue el bug del "Link inválido": la tabla tiene `activo`
-- pero una versión vieja de la función consultaba `activa`.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN '✅ OK · no existe la columna duplicada `activa`'
       ELSE '❌ EXISTE `activa` — correr 20_CATALOGO_CANONICO'
  END AS estado
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ofertas_cliente'
  AND column_name  = 'activa';


-- ── 4 · FUNCIONES: una sola firma cada una ─────────────────
-- Dos firmas de la misma función = "function reference is not unique"
-- y el pedido del cliente falla al enviarse.
SELECT
  p.proname                                    AS funcion,
  COUNT(*)                                     AS firmas,
  string_agg(pg_get_function_identity_arguments(p.oid), '  |  ') AS argumentos,
  CASE WHEN COUNT(*) = 1
       THEN '✅ OK'
       ELSE '❌ AMBIGUA — correr 20 y 21'
  END                                          AS estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_public_catalogo','crear_pedido_publico','marcar_pedido_externo',
    'guardar_push_suscripcion','borrar_push_suscripcion','enviar_push_catalogo',
    'sugerir_reposicion_catalogo','get_pedidos_publicos','reordenar_pedido_publico',
    'mi_ejecutivo_id','mi_rol','soy_admin','mi_tenant'
  )
GROUP BY p.proname
ORDER BY estado DESC;


-- ── 5 · PERMISOS del catálogo público ──────────────────────
-- El cliente entra SIN login: si `anon` no puede ejecutar, ve "Link inválido".
SELECT
  p.proname AS funcion,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN '✅ anon puede ejecutar'
       ELSE '❌ FALTA GRANT a anon'
  END AS estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_public_catalogo','crear_pedido_publico');


-- ── 6 · RLS activo donde corresponde ───────────────────────
SELECT
  c.relname AS tabla,
  CASE WHEN c.relrowsecurity THEN '✅ RLS activo' ELSE '❌ RLS APAGADO' END AS estado,
  COUNT(pol.polname) AS politicas
FROM pg_class c
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relname IN (
    'ofertas_cliente','oferta_cliente_items','pedidos','prospectos',
    'visitas','checkins','notas_cliente','encuestas_visita','decision_feedback',
    'cartera','stock','metas','focos','ejecutivos','gerencia_clientes',
    'push_suscripciones'
  )
GROUP BY c.relname, c.relrowsecurity
ORDER BY estado DESC, c.relname;


-- ── 7 · ⚠️ POLÍTICAS ABIERTAS ──────────────────────────────
-- USING(true) = cualquier usuario autenticado ve TODO.
-- Hoy no duele con un solo tenant. Con el segundo es fuga de datos.
-- Ver Fase 1.3 del ROADMAP.
SELECT
  c.relname   AS tabla,
  pol.polname AS politica,
  '⚠️ USING(true) — revisar antes de multi-tenant' AS advertencia
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'
ORDER BY c.relname;


-- ── 8 · FRESCURA DE LA BAJADA ──────────────────────────────
-- Si estos datos son viejos, la app muestra números viejos.
SELECT
  'cartera' AS tabla,
  COUNT(*)  AS filas,
  MAX(fecha_snapshot)::text AS ultimo_snapshot,
  CASE
    WHEN COUNT(*) = 0 THEN '❌ VACÍA — correr el ETL'
    WHEN MAX(fecha_snapshot) < CURRENT_DATE - INTERVAL '2 days' THEN '⚠️ datos viejos'
    ELSE '✅ OK'
  END AS estado
FROM public.cartera
UNION ALL
SELECT
  'stock', COUNT(*), MAX(fecha_snapshot)::text,
  CASE
    WHEN COUNT(*) = 0 THEN '❌ VACÍA — correr el ETL'
    WHEN MAX(fecha_snapshot) < CURRENT_DATE - INTERVAL '2 days' THEN '⚠️ datos viejos'
    ELSE '✅ OK'
  END
FROM public.stock;


-- ── 9 · CATÁLOGOS INALCANZABLES ────────────────────────────
-- activo NULL nunca cumple `activo = true`: el cliente ve "Link inválido"
-- aunque el link sea correcto.
SELECT
  COUNT(*)                                   AS total,
  COUNT(*) FILTER (WHERE activo IS TRUE)     AS visibles,
  COUNT(*) FILTER (WHERE activo IS NOT TRUE) AS ocultos,
  CASE WHEN COUNT(*) FILTER (WHERE activo IS NULL) > 0
       THEN '❌ hay activo NULL — correr 20_CATALOGO_CANONICO'
       ELSE '✅ OK'
  END AS estado
FROM public.ofertas_cliente;


-- ── 10 · PUSH: acceso SOLO por RPC ───────────────────────────
-- La tabla de suscripciones NO debe tener policies: cualquiera podría
-- leer endpoints de push ajenos. El acceso es por RPC SECURITY DEFINER
-- o service key, nunca por SELECT directo de anon/authenticated.
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls,
  COUNT(pol.polname) AS politicas,
  CASE
    WHEN COUNT(pol.polname) = 0 THEN '✅ OK · solo RPC/service key'
    ELSE '❌ HAY POLICIES — revisar 37_PUSH_SUSCRIPCIONES'
  END AS estado
FROM pg_class c
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname = 'push_suscripciones'
GROUP BY c.relname, c.relrowsecurity;


-- ── 11 · RLS ESTRICTO (28): pre-vuelo antes de aplicarlo ─────
-- Si un auth user no tiene fila en `ejecutivos`, el 28 lo dejaría sin
-- ver nada. Revisar ANTES de correr la migración.
SELECT
  u.id::text AS user_id,
  u.email,
  CASE WHEN e.id IS NULL THEN '❌ SIN PERFIL — crearlo antes del 28'
       ELSE '✅ OK'
  END AS estado,
  COALESCE(e.rol, '(sin rol)') AS rol
FROM auth.users u
LEFT JOIN public.ejecutivos e ON e.id::text = u.id::text
ORDER BY estado DESC, u.email;
