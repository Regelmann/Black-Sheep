-- ============================================================
-- 34 · ¿DÓNDE SE PIERDEN LOS PROSPECTOS DE CADA ZONA?
-- ============================================================
-- Sólo lectura.
--
-- SÍNTOMA
-- La app muestra 917 en Nor-Oriente, 462 en Nor-Poniente y 1000 en
-- Zona Sur, cuando la base tiene 2389 / 3870 / 3627.
--
-- Ruta.jsx aplica cuatro filtros en cadena, y ninguno avisa cuánto
-- descarta. Esta consulta los replica UNO POR UNO para ver en cuál se
-- caen. Las columnas se leen de izquierda a derecha: donde el número
-- pega un salto hacia abajo, ahí está el filtro culpable.
--
--  en_la_base   → total de la zona
--  con_coords   → lat/lng no nulos            (Ruta descarta el resto)
--  dentro_caja  → dentro del recuadro Santiago de BOUNDS
--  no_bloqueado → estado <> 'bloqueado'
--
-- El 1000 exacto de Zona Sur es sospechoso aparte: es el tope por
-- defecto de PostgREST (db-max-rows). Si esta consulta dice que hay
-- 3627 válidos y la app muestra 1000 redondo, el corte lo está
-- poniendo el servidor, no el código.
-- ============================================================

select
  upper(trim(zona))                                as zona,
  count(*)                                         as en_la_base,
  count(*) filter (
    where lat is not null and lng is not null
  )                                                as con_coords,
  count(*) filter (
    where lat is not null and lng is not null
      and lat between -34.40 and -32.75
      and lng between -71.80 and -69.70
  )                                                as dentro_caja,
  count(*) filter (
    where lat is not null and lng is not null
      and lat between -34.40 and -32.75
      and lng between -71.80 and -69.70
      and coalesce(lower(estado::text), '') <> 'bloqueado'
  )                                                as no_bloqueado
from public.prospectos
group by upper(trim(zona))
order by 2 desc;