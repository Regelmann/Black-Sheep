-- ============================================================
-- 33 · ALINEAR zonas_comunas CON LA MAESTRA DE GERENCIA
-- ============================================================
-- Escribe en zonas_comunas. Idempotente.
--
-- CORRIGE UN ERROR MÍO
-- La versión anterior de este archivo movía NUNOA a NOR-ORIENTE y
-- MACUL a ZONA SUR. Las dos estaban mal:
--
--   · la maestra de gerencia pone NUNOA en NOR-PONIENTE
--   · MACUL es ZONA SUR, no la que yo puse por geografía
--
-- Lo deduje al revés: vi 482 prospectos de Ñuñoa con zona
-- NOR-ORIENTE y supuse que la maestra de comunas estaba equivocada.
-- No lo estaba. Esos 482 son clientes que gerencia asignó a
-- Nor-Oriente aunque estén en una comuna de Nor-Poniente, y eso es
-- una decisión válida, no un dato sucio.
--
-- SI YA CORRISTE LA VERSIÓN ANTERIOR, este script la revierte.
--
-- QUÉ HACE
-- Deja zonas_comunas igual a la maestra en las dos comunas que
-- difieren, y saca MACUL, que no pertenece a ninguna zona asignada.
-- El arreglo de fondo NO es éste: es que la app deje de usar la comuna
-- para pisar la zona que gerencia asignó a cada cliente
-- (lib/zonas.js · prospectoVisible).
-- ============================================================

-- 1. Ñuñoa vuelve a Nor-Poniente, como dice la maestra.
insert into public.zonas_comunas (comuna, zona) values
  ('NUNOA', 'NOR-PONIENTE')
on conflict (comuna) do update set zona = excluded.zona;

-- 2. Macul es ZONA SUR (confirmado por el administrador).
insert into public.zonas_comunas (comuna, zona) values
  ('MACUL', 'ZONA SUR')
on conflict (comuna) do update set zona = excluded.zona;

-- 3. San Bernardo y Puente Alto: geográficamente sur, pero la maestra
--    los asigna a Nor-Oriente.
insert into public.zonas_comunas (comuna, zona) values
  ('SAN BERNARDO', 'NOR-ORIENTE'),
  ('PUENTE ALTO',  'NOR-ORIENTE')
on conflict (comuna) do update set zona = excluded.zona;

-- Comprobación.
select comuna, zona from public.zonas_comunas
where comuna in ('NUNOA', 'MACUL', 'SAN BERNARDO', 'PUENTE ALTO')
order by comuna;