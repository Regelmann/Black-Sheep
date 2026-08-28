-- ============================================================
-- 32 · ¿LA COMUNA Y LA ZONA DE CADA PROSPECTO SE CONTRADICEN?
-- ============================================================
-- Sólo lectura.
--
-- POR QUÉ IMPORTA
-- lib/zonas.js · prospectoVisible() decide en este orden:
--
--   1. si el prospecto está asignado al ejecutivo → visible
--   2. si su COMUNA está en zonas_comunas → manda la comuna,
--      y si esa zona no es la activa, el prospecto NO SE MUESTRA
--   3. recién si la comuna es desconocida se usa el campo `zona`
--
-- O sea: la comuna le gana al campo `zona`. Un prospecto con
-- zona='NOR-ORIENTE' pero comuna='MAIPU' (que zonas_comunas mapea a
-- ZONA SUR) NO aparece para el vendedor de Nor-Oriente... ni tampoco
-- para el de Zona Sur, porque la consulta que los trae filtra por
-- .eq('zona', 'ZONA SUR') y esta fila dice NOR-ORIENTE.
--
-- Cae en el hueco entre los dos filtros y no lo ve nadie.
--
-- Esta consulta cuenta exactamente esos casos.
-- ============================================================

with p as (
  select
    cliente_key,
    nombre_cliente,
    upper(trim(zona)) as zona_fila,
    translate(upper(trim(comuna)),
              'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛ',
              'AEIOUUNAEIOUAEIOU') as comuna_norm,
    comuna
  from public.prospectos
),
z as (
  select distinct
    translate(upper(trim(comuna)),
              'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛ',
              'AEIOUUNAEIOUAEIOU') as comuna_norm,
    upper(trim(zona)) as zona_mapa
  from public.zonas_comunas
)
select
  p.zona_fila            as dice_la_fila,
  z.zona_mapa            as dice_la_comuna,
  p.comuna,
  count(*)               as prospectos,
  'INVISIBLE para ambos vendedores' as consecuencia
from p
join z on z.comuna_norm = p.comuna_norm
where z.zona_mapa <> p.zona_fila
group by p.zona_fila, z.zona_mapa, p.comuna
order by count(*) desc;