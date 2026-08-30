-- ============================================================
-- 31 · ¿LOS VALORES DE `zona` COINCIDEN CON LO QUE FILTRA LA APP?
-- ============================================================
-- Sólo lectura.
--
-- POR QUÉ
-- El diagnóstico dio datos impecables: 9.886 prospectos, todos con
-- coordenadas, ninguno sin comuna ni sin zona, cero duplicados. Y sin
-- embargo la app mostraba pantallas vacías.
--
-- Cuando los datos están bien y la pantalla está vacía, el sospechoso
-- es el FILTRO. Ruta.jsx hace:
--
--     .eq('zona', zonaNom)
--
-- donde zonaNom = String(zonaVista).toUpperCase().trim(). Es igualdad
-- EXACTA contra las claves internas del código:
--
--     NOR-ORIENTE · NOR-PONIENTE · ZONA SUR
--
-- Si en la base dice 'Nor-Oriente', 'NORORIENTE', 'Norte Oriente' o
-- 'SUR' a secas, el .eq() no matchea NADA y el vendedor ve cero
-- prospectos, aunque las 9.886 filas estén perfectas.
--
-- Ojo: la app SÍ normaliza los nombres de COMUNA (quita tildes), pero
-- NO normaliza el nombre de la ZONA. Son dos caminos distintos.
-- ============================================================

select
  zona,
  count(*) as prospectos,
  case
    when zona in ('NOR-ORIENTE','NOR-PONIENTE','ZONA SUR')
      then 'OK · la app la reconoce'
    else 'NO MATCHEA · la app filtra por igualdad exacta'
  end as diagnostico
from public.prospectos
group by zona
order by count(*) desc;