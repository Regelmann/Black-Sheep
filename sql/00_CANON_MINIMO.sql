-- =============================================================================
-- BLACK SHEEP · SQL CANÓN MÍNIMO (idempotente)
-- Correr UNA vez en Supabase → SQL Editor → Run
-- No borra datos. Solo crea tablas/columnas/funciones si faltan.
-- =============================================================================

-- ── Core tablas que publica el CICLO ──────────────────────────────────────────

create table if not exists public.ejecutivos (
  id text primary key,
  nombre text,
  zona text,
  email text,
  activo boolean default true
);

create table if not exists public.cartera (
  ejecutivo_id text not null,
  cliente_key text not null,
  nombre_cliente text,
  comuna text,
  direccion text,
  telefono text,
  lat double precision,
  lng double precision,
  venta_mtd numeric default 0,
  venta_mensual numeric default 0,
  venta_historica numeric default 0,
  dias_sin_comprar numeric,
  ciclo_dias numeric,
  ultima_compra date,
  primera_compra date,
  estado_fuga text,
  sku_detalle text,
  oferta_real text,
  productos_top text,
  es_bloqueado boolean default false,
  es_nuevo_mes boolean default false,
  link_whatsapp text,
  persona_contacto text,
  actualizado_en timestamptz default now(),
  primary key (ejecutivo_id, cliente_key)
);

create table if not exists public.stock (
  sku_canon text primary key,
  producto_nombre text,
  stock_operativo numeric default 0,
  cobertura_dias numeric,
  estado_stock text,
  es_foco_mes boolean default false,
  foco text,
  precio_unidad numeric,
  precio_caja numeric,
  precio_kilo numeric,
  precio_lista numeric,
  marca text,
  categoria text,
  subfamilia text,
  unidad_venta text,
  imagen_url text,
  ficha_url text,
  resena text,
  actualizado_en timestamptz default now()
);

create table if not exists public.ventas_lineas (
  linea_id text primary key,
  cliente_key text,
  nombre_cliente text,
  sku_canon text,
  producto_nombre text,
  fecha date,
  cantidad numeric,
  cantidad_unidad numeric,
  venta_neta_clp numeric,
  vendedor_raw text,
  zona_vendedor text,
  numero_documento text,
  fuente text,
  creado_en timestamptz default now()
);
create index if not exists ventas_lineas_cliente_fecha_idx
  on public.ventas_lineas (cliente_key, fecha desc);
create index if not exists ventas_lineas_sku_idx
  on public.ventas_lineas (sku_canon);

create table if not exists public.gerencia (
  ejecutivo text primary key,
  zona text,
  venta_mtd numeric default 0,
  meta_mensual numeric,
  clientes_mtd integer,
  accion text,
  actualizado_en timestamptz default now()
);

create table if not exists public.gerencia_clientes (
  ejecutivo text not null,
  cliente_key text not null,
  nombre_cliente text,
  venta_mtd numeric default 0,
  sku_detalle text,
  productos_top text,
  oferta_real text,
  dias_sin_comprar numeric,
  ultima_compra date,
  primary key (ejecutivo, cliente_key)
);

create table if not exists public.metas (
  id text primary key,
  ejecutivo_id text,
  mes date,
  meta_mensual numeric,
  venta_mtd numeric,
  pct_avance numeric,
  brecha numeric,
  fecha_snapshot date
);

create table if not exists public.focos (
  id text primary key,
  ejecutivo_id text,
  foco text,
  meta_unidad numeric,
  vendido_unidad numeric,
  unidad_meta text,
  pct_avance numeric,
  estado_ritmo text,
  fecha_snapshot date
);

create table if not exists public.tendencia (
  mes text primary key,
  venta_total numeric,
  actualizado_en timestamptz default now()
);

create table if not exists public.prospectos (
  id bigserial primary key,
  ejecutivo_id text,
  zona text,
  nombre text,
  direccion text,
  comuna text,
  lat double precision,
  lng double precision,
  telefono text,
  tipo text,
  place_id text,
  creado_en timestamptz default now()
);

create table if not exists public.snapshot_meta (
  id text primary key default 'latest',
  mes date,
  venta_mtd_total numeric,
  actualizado_en timestamptz default now()
);

-- ── Operación en terreno ──────────────────────────────────────────────────────

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  cliente_key text,
  nombre_cliente text,
  lineas jsonb,
  nota text,
  estado text default 'borrador',
  fuente text,
  total_estimado numeric,
  token_catalogo text,
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now()
);
create index if not exists pedidos_cliente_fecha_idx
  on public.pedidos (cliente_key, creado_en desc);

create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  cliente_key text,
  nombre_local text,
  estado text,
  resultado text,
  hora_llegada timestamptz,
  hora_salida timestamptz,
  lat double precision,
  lng double precision,
  nota text,
  creado_en timestamptz default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  cliente_key text,
  lat double precision,
  lng double precision,
  hora_llegada timestamptz default now(),
  creado_en timestamptz default now()
);

create table if not exists public.notas_cliente (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  cliente_key text,
  nombre_local text,
  tipo text,
  texto text,
  creado_en timestamptz default now()
);

create table if not exists public.encuestas_visita (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  cliente_key text,
  respuestas jsonb,
  creado_en timestamptz default now()
);

create table if not exists public.rutas (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  fecha date,
  paradas jsonb,
  creado_en timestamptz default now()
);

-- ── Catálogo web / ofertas ────────────────────────────────────────────────────

create table if not exists public.ofertas_cliente (
  id uuid primary key default gen_random_uuid(),
  token text unique,
  cliente_key text,
  ejecutivo_id text,
  activa boolean default true,
  creado_en timestamptz default now()
);

create table if not exists public.oferta_cliente_items (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid references public.ofertas_cliente(id) on delete cascade,
  sku_canon text,
  producto_nombre text,
  precio numeric,
  cantidad_sugerida numeric,
  origen text
);

create table if not exists public.zonas_comunas (
  zona text not null,
  comuna text not null,
  primary key (zona, comuna)
);

create table if not exists public.decision_feedback (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id text,
  cliente_key text,
  decision_type text,
  outcome text,
  creado_en timestamptz default now()
);

create table if not exists public.decision_effectiveness (
  id uuid primary key default gen_random_uuid(),
  metric text,
  value numeric,
  mes date,
  creado_en timestamptz default now()
);

-- ── Columnas extra (por si las tablas ya existían sin ellas) ─────────────────

alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists precio_lista numeric;
alter table public.stock add column if not exists es_foco_mes boolean default false;
alter table public.stock add column if not exists cobertura_dias numeric;
alter table public.stock add column if not exists estado_stock text;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists resena text;
alter table public.stock add column if not exists marca text;
alter table public.stock add column if not exists categoria text;
alter table public.stock add column if not exists subfamilia text;

alter table public.pedidos add column if not exists estado text default 'borrador';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists nombre_cliente text;
alter table public.pedidos add column if not exists token_catalogo text;
alter table public.pedidos add column if not exists creado_en timestamptz default now();

alter table public.cartera add column if not exists sku_detalle text;
alter table public.cartera add column if not exists es_bloqueado boolean default false;

-- ── RLS permisivo para app (anon/authenticated lee; service role escribe ciclo) ─
-- Ajustá políticas en producción si necesitás restringir por ejecutivo.

do $$
declare t text;
begin
  foreach t in array array[
    'cartera','stock','ventas_lineas','gerencia','gerencia_clientes','metas','focos',
    'tendencia','prospectos','pedidos','visitas','checkins','notas_cliente',
    'ejecutivos','ofertas_cliente','oferta_cliente_items','snapshot_meta'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists bs_read_all on public.%I', t);
    execute format('create policy bs_read_all on public.%I for select using (true)', t);
    execute format('drop policy if exists bs_write_auth on public.%I', t);
    execute format(
      'create policy bs_write_auth on public.%I for all using (true) with check (true)',
      t
    );
  end loop;
exception when others then
  raise notice 'RLS setup partial: %', sqlerrm;
end $$;

-- ── RPC catálogo público (versión mínima lista-first) ─────────────────────────
-- Si ya tenés get_public_catalogo de V56, este replace es compatible.

create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oferta public.ofertas_cliente%rowtype;
  v_items jsonb;
begin
  select * into v_oferta
  from public.ofertas_cliente
  where token = p_token and coalesce(activa, true) = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_invalido');
  end if;

  select coalesce(jsonb_agg(x.obj order by x.ord, x.nombre), '[]'::jsonb)
  into v_items
  from (
    select
      0 as ord,
      coalesce(i.producto_nombre, s.producto_nombre, i.sku_canon) as nombre,
      jsonb_build_object(
        'sku_canon', coalesce(i.sku_canon, s.sku_canon),
        'producto_nombre', coalesce(i.producto_nombre, s.producto_nombre),
        'precio', coalesce(i.precio, s.precio_unidad, s.precio_lista),
        'precio_lista', s.precio_unidad,
        'stock_operativo', s.stock_operativo,
        'origen', coalesce(i.origen, 'lista'),
        'imagen_url', s.imagen_url,
        'resena', s.resena,
        'ficha_url', s.ficha_url,
        'es_foco_mes', coalesce(s.es_foco_mes, false)
      ) as obj
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon = i.sku_canon
    where i.oferta_id = v_oferta.id

    union all

    select
      1 as ord,
      s.producto_nombre as nombre,
      jsonb_build_object(
        'sku_canon', s.sku_canon,
        'producto_nombre', s.producto_nombre,
        'precio', coalesce(s.precio_unidad, s.precio_lista),
        'precio_lista', s.precio_unidad,
        'stock_operativo', s.stock_operativo,
        'origen', 'lista',
        'imagen_url', s.imagen_url,
        'resena', s.resena,
        'ficha_url', s.ficha_url,
        'es_foco_mes', coalesce(s.es_foco_mes, false)
      ) as obj
    from public.stock s
    where coalesce(s.precio_unidad, s.precio_lista, 0) > 0
      and not exists (
        select 1 from public.oferta_cliente_items i
        where i.oferta_id = v_oferta.id and i.sku_canon = s.sku_canon
      )
  ) x;

  return jsonb_build_object(
    'ok', true,
    'cliente_key', v_oferta.cliente_key,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;

-- =============================================================================
-- FIN SQL CANÓN
-- Verificación rápida:
--   select count(*) from stock;
--   select count(*) from cartera;
--   select count(*) filter (where coalesce(precio_unidad,0)>0) from stock;
-- =============================================================================
