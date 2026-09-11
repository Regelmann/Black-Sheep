-- ═══════════════════════════════════════════════════════════════════
-- ¿QUEDÓ ALGO DE UNA CORRIDA ANTERIOR?
--
-- Compara lo que hay en esta base contra lo que dejan exactamente las
-- 31 migraciones. Todo lo que aparezca es huérfano: una función de una
-- generación vieja que CREATE OR REPLACE no pisó porque tenía otra
-- firma, y que sigue viva y llamable.
--
-- Lo esperado es que las dos consultas devuelvan CERO filas.
-- ═══════════════════════════════════════════════════════════════════

-- 1 · Funciones que sobran
SELECT n.nspname || '.' || p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ')' AS sobrante,
       p.prosecdef AS es_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS la_llama_la_app
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('api','platform','core','ingest','compliance')
   AND n.nspname || '.' || p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ')' NOT IN (
  'api.admin_alta_empresa(p_slug text, p_nombre text, p_plan text, p_dias_trial integer, p_color text)',
  'api.admin_archivar(p_tenant uuid)',
  'api.admin_asignar_usuario(p_tenant uuid, p_email text, p_rol text, p_ejecutivo_id text)',
  'api.admin_configurar_documentos(p_tenant uuid, p_documentos jsonb)',
  'api.admin_dar_de_baja(p_tenant uuid, p_motivo text)',
  'api.admin_empresa(p_tenant uuid)',
  'api.admin_empresas()',
  'api.admin_estado_excluido(p_tenant uuid, p_estados text[])',
  'api.admin_marca(p_tenant uuid, p_nombre text, p_color text, p_logo_url text)',
  'api.admin_quitar_usuario(p_tenant uuid, p_usuario uuid)',
  'api.admin_registrar_pago(p_tenant uuid, p_periodo date, p_monto numeric, p_referencia text, p_meses integer)',
  'api.admin_resumen()',
  'api.admin_set_capacidad(p_tenant uuid, p_capacidad text, p_activa boolean)',
  'api.admin_set_suscripcion(p_tenant uuid, p_estado text, p_vigente_hasta date, p_nota text)',
  'api.agregar_filas(p_lote uuid, p_filas jsonb)',
  'api.alta_ejecutivo(p_id text, p_nombre text, p_zona text, p_email text, p_usuario uuid)',
  'api.baja_ejecutivo(p_id text, p_reasignar_a text)',
  'api.convertir_prospecto(p_cliente_key text)',
  'api.crear_pedido(p_client_op_id uuid, p_cliente_key text, p_lineas jsonb, p_nota text)',
  'api.crear_pedido_publico(p_token text, p_lineas jsonb, p_nota text, p_client_op_id uuid)',
  'api.ejecutar_ciclo(p_lote uuid, p_venta_oficial numeric)',
  'api.emitir_token_catalogo(p_cliente_key text)',
  'api.get_catalogo(p_token text)',
  'api.guardar_cliente(p_cliente_key text, p_nombre text, p_zona text, p_ejecutivo text, p_comuna text, p_direccion text, p_lat numeric, p_lng numeric, p_rubro text, p_bloqueado boolean, p_persona_natural boolean)',
  'api.guardar_costo(p_sku text, p_costo numeric, p_vigente_desde date)',
  'api.guardar_precio(p_sku text, p_precio_unidad numeric, p_precio_caja numeric, p_precio_kilo numeric, p_vigente_desde date, p_lista text)',
  'api.guardar_precio_cliente(p_cliente_key text, p_sku text, p_precio numeric, p_motivo text, p_vigente_hasta date)',
  'api.guardar_producto(p_sku text, p_nombre text, p_categoria text, p_marca text, p_unidad_venta text, p_unidades_caja numeric, p_kg_unidad numeric, p_imagen_url text, p_activo boolean)',
  'api.guardar_prospecto(p_cliente_key text, p_nombre text, p_ejecutivo text, p_zona text, p_comuna text, p_direccion text, p_rubro text, p_lat numeric, p_lng numeric)',
  'api.guardar_stock(p_sku text, p_stock_total numeric, p_almacen text, p_stock_cajas numeric, p_fecha_venc date)',
  'api.hash_token(p_token text)',
  'api.invitar_usuario(p_email text, p_rol text, p_nombre text, p_ejecutivo_id text)',
  'api.liberar_campo(p_objeto text, p_llave text, p_campo text)',
  'api.marca_por_slug(p_slug text)',
  'api.precios_cliente(p_cliente_key text)',
  'api.publicar_lote(p_lote uuid, p_umbral_pct numeric, p_aprobar_caida boolean)',
  'api.quitar_precio_cliente(p_cliente_key text, p_sku text)',
  'api.rate_limit_ok(p_key text, p_max integer)',
  'api.reasignar_cliente(p_cliente_key text, p_zona text, p_ejecutivo text)',
  'api.registrar_carga(p_tipo text, p_nombre text, p_sha256 text, p_bytes bigint, p_storage_path text)',
  'api.registrar_checkin(p_client_op_id uuid, p_cliente_key text, p_lat double precision, p_lng double precision, p_precision_m numeric, p_visita_id uuid)',
  'api.registrar_nota(p_client_op_id uuid, p_cliente_key text, p_texto text)',
  'api.registrar_visita(p_client_op_id uuid, p_cliente_key text, p_estado text, p_resultado text)',
  'api.resolver_conflicto(p_conflicto bigint, p_resolucion text)',
  'api.revertir_lote(p_lote uuid)',
  'api.revocar_token_catalogo(p_token_id uuid)',
  'api.set_foco(p_mes date, p_sku text, p_meta_unidades numeric, p_zona text)',
  'api.set_meta(p_ejecutivo text, p_mes date, p_monto numeric)',
  'api.set_zona_comuna(p_comuna text, p_zona text)',
  'compliance.aplicar_retencion(p_dry_run boolean)',
  'compliance.diagnostico()',
  'core.es_mi_cliente(p_cliente_key text)',
  'core.estado_cliente(p_dias_sin_comprar integer, p_bloqueado boolean)',
  'core.marcar_manual(p_actual text[], p_campos text[])',
  'core.mi_ejecutivo()',
  'core.precio_historico(p_tenant uuid, p_cliente_key text, p_sku text, p_meses integer)',
  'core.precio_para_cliente(p_tenant uuid, p_cliente_key text, p_sku text)',
  'core.signo_documento(p_tenant uuid, p_tipo_doc text)',
  'core.venta_elegible(p_tenant uuid, p_tipo_doc text, p_estado text)',
  'ingest.a_fecha(p text)',
  'ingest.a_numero(p text)',
  'ingest.norm_texto(p text)',
  'ingest.normalizar(p_tenant uuid, p_tipo text, p_datos jsonb)',
  'ingest.tomar_candado(p_tenant uuid)',
  'platform.capacidad_activa(p_codigo text, p_tenant uuid)',
  'platform.custom_access_token_hook(event jsonb)',
  'platform.es_superadmin()',
  'platform.fn_auditar()',
  'platform.fn_sincronizar_usuario()',
  'platform.jwt()',
  'platform.puede(p_permiso text)',
  'platform.rol_en_tenant(p_tenant uuid)',
  'platform.sembrar_capacidades(p_tenant uuid)',
  'platform.tenant_actual()',
  'platform.tenant_habilitado(p_tenant uuid)',
  'platform.tiene_acceso(p_tenant uuid)',
  'platform.usuario_actual()'
)
 ORDER BY 1;

-- 2 · Restos de la 15.x
-- La 2.0 no usa el esquema `public` para nada. Cualquier tabla acá
-- viene de una corrida anterior o de la 15.x.
SELECT 'public.' || c.relname AS tabla_sobrante,
       c.relrowsecurity AS tiene_rls,
       (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS politicas,
       (SELECT n_live_tup FROM pg_stat_user_tables t WHERE t.relid = c.oid) AS filas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r' AND n.nspname = 'public'
 ORDER BY 1;

-- 3 · Vistas que sobran en api
SELECT 'api.' || c.relname AS vista_sobrante
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'v' AND n.nspname = 'api'
   AND c.relname NOT IN ('cartera','stock_vendible','mi_dia','llamar_hoy','ruta_dia',
                         'gerencia_zona','gerencia_ejecutivo','gerencia_producto',
                         'integridad','mis_capacidades','mi_suscripcion','cargas',
                         'carga_exclusiones','conflictos','prospectos',
                         'mi_cartera','mis_pedidos')
 ORDER BY 1;
