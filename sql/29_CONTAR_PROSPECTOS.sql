-- ============================================================
-- 29 · ¿CUÁNTOS PROSPECTOS HAY Y CUÁNTOS SE PUEDEN USAR?
-- ============================================================
-- Sólo lectura. No modifica nada. Correr en el SQL Editor de Supabase.
--
-- POR QUÉ ESTE ARCHIVO
-- El total de la tabla no es el dato que importa. Un prospecto sin
-- coordenadas no aparece en el mapa, y uno sin comuna mapeada a zona
-- no le llega a ningún vendedor. La pregunta útil no es "cuántos hay"
-- sino "cuántos puede trabajar alguien hoy".
--
-- Además hay un techo duro en el código: Ruta.jsx trae los prospectos
-- con .limit(8000). Si el total supera esa cifra, la app NUNCA los ve
-- todos, y sin ORDER BY el corte es arbitrario: PostgREST devuelve las
-- filas en el orden que le conviene al planner, así que los que quedan
-- afuera pueden cambiar entre una carga y otra.
-- ============================================================


-- ---------- 1) EL TOTAL ----------
select count(*) as prospectos_totales
from public.prospectos;


-- ---------- 2) CUÁNTOS SIRVEN DE VERDAD ----------
-- Sin lat/lng no hay pin. Sin comuna no hay forma de asignarlo a zona.
select
  count(*)                                                as total,
  count(*) filter (where lat is not null and lng is not null)  as con_coordenadas,
  count(*) filter (where lat is null  or  lng is null)         as sin_coordenadas,
  count(*) filter (where coalesce(trim(comuna), '') = '')      as sin_comuna,
  count(*) filter (where coalesce(trim(zona),   '') = '')      as sin_zona_asignada,
  count(*) filter (where ejecutivo_id is not null)             as con_dueno,
  count(*) filter (where ejecutivo_id is null)                 as sin_dueno
from public.prospectos;


-- ---------- 3) ¿ROMPE EL TECHO DE 8000? ----------
-- Ruta.jsx:364 hace .limit(8000) sobre los que tienen lat.
select
  count(*) filter (where lat is not null)          as visibles_en_mapa,
  8000                                             as techo_del_codigo,
  greatest(count(*) filter (where lat is not null) - 8000, 0)
                                                   as quedan_fuera_del_limite
from public.prospectos;


-- ---------- 4) DUPLICADOS ----------
-- La app deduplica en memoria por cliente_key (y cae a nombre_cliente
-- si falta). Si hay muchas claves repetidas, el conteo crudo está
-- inflado respecto de lo que el vendedor termina viendo.
select
  count(*)                                as filas,
  count(distinct cliente_key)             as claves_unicas,
  count(*) - count(distinct cliente_key)  as filas_repetidas
from public.prospectos
where coalesce(trim(cliente_key), '') <> '';

-- Los peores casos, por si hay que limpiarlos
select cliente_key, count(*) as veces
from public.prospectos
where coalesce(trim(cliente_key), '') <> ''
group by cliente_key
having count(*) > 1
order by count(*) desc
limit 20;


-- ---------- 5) REPARTO POR ZONA ----------
-- Lo que cada vendedor ve al abrir el mapa. Una zona con 3000 y otra
-- con 40 es un problema de asignación, no de datos.
select
  coalesce(nullif(trim(zona), ''), '(sin zona)') as zona,
  count(*)                                       as prospectos,
  count(*) filter (where lat is not null)        as con_coordenadas
from public.prospectos
group by 1
order by 2 desc;


-- ---------- 6) COMUNAS QUE NO ESTÁN MAPEADAS A NINGUNA ZONA ----------
-- Estos son los que la app muestra marcados como "sin_mapear".
-- Cada fila acá es un grupo de prospectos que nadie tiene asignado.
select
  p.comuna,
  count(*) as prospectos_huerfanos
from public.prospectos p
left join public.zonas_comunas zc
  on upper(trim(zc.comuna)) = upper(trim(p.comuna))
where zc.comuna is null
  and coalesce(trim(p.comuna), '') <> ''
group by p.comuna
order by count(*) desc;


-- ---------- 7) ¿ESTÁN VIVOS O SON UN VOLCADO MUERTO? ----------
-- Un prospecto en 'nuevo' desde hace un año no es una oportunidad,
-- es ruido en el mapa.
select
  coalesce(nullif(trim(estado), ''), '(sin estado)') as estado,
  count(*)                                           as cuantos
from public.prospectos
group by 1
order by 2 desc;