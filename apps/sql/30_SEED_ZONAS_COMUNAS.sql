-- ============================================================
-- 30 · POBLAR zonas_comunas  (LA TABLA ESTÁ VACÍA)
-- ============================================================
-- POR QUÉ
-- El diagnóstico de prospectos devolvió 9.886 filas y prácticamente
-- TODAS las comunas como "huérfanas": Santiago, Maipú, Ñuñoa, Recoleta,
-- La Reina, Puente Alto... Cuando la lista de huérfanas incluye a las
-- comunas más grandes de Santiago, la explicación no es que falten
-- algunas: es que `zonas_comunas` está vacía.
--
-- CONSECUENCIA
-- Ruta.jsx arma el conjunto de comunas de la zona activa leyendo esa
-- tabla (cargarIndiceZonas). Con la tabla vacía, ese conjunto es vacío,
-- así que el "rescate por comuna" no agrega a nadie y los prospectos
-- sin `zona` cargada en su propia fila no le llegan a ningún vendedor.
-- Son ~9.886 prospectos que existen en la base y no se pueden trabajar.
--
-- QUÉ HACE
-- Carga las 52 comunas de la RM que conoce `lib/zonas.js`, con la misma
-- normalización que usa la app (mayúsculas y SIN tildes: normComuna
-- hace NFD + strip de diacríticos). Si se cargaran con tilde, el LEFT
-- JOIN no matchearía y la tabla seguiría sin servir.
--
-- Es idempotente: `on conflict do nothing`. Correrlo dos veces no
-- duplica ni pisa lo que ya hayas ajustado a mano.
--
-- OJO CON EL REPARTO
-- La propuesta geográfica sale del código y seguro no calza con cómo
-- reparten el territorio en la práctica. Después de correrlo, revisá en
-- Admin → Zonas y corregí lo que no cuadre: la tabla manda sobre el
-- código.
--
-- ALTERNATIVA SIN SQL
-- Admin → Zonas → "Cargar defaults KeyFoods" hace exactamente esto.
-- ============================================================

-- FORMATO
-- Una sola sentencia de 7 lineas en vez de 56. La version anterior
-- listaba cada comuna en su propia fila y al copiarla del chat se
-- perdian lineas: bastaba que faltara una para que Postgres tirara
-- "syntax error at or near )". Con unnest(array[...]) el copiado
-- es atomico.
-- ============================================================

insert into public.zonas_comunas (comuna, zona)
select unnest(array['ALHUE','BUIN','CALERA DE TANGO','CERRILLOS','EL BOSQUE','EL MONTE','ISLA DE MAIPO','LA CISTERNA','LA FLORIDA','LA GRANJA','LA PINTANA','LO ESPEJO','MAIPU','MELIPILLA','PADRE HURTADO','PAINE','PEDRO AGUIRRE CERDA','PENAFLOR','PIRQUE','PUENTE ALTO','SAN BERNARDO','SAN JOAQUIN','SAN MIGUEL','SAN PEDRO','SAN RAMON','TALAGANTE']), 'ZONA SUR'
union all
select unnest(array['CERRO NAVIA','COLINA','CONCHALI','CURACAVI','ESTACION CENTRAL','HUECHURABA','INDEPENDENCIA','LAMPA','LO PRADO','MARIA PINTO','NUNOA','PROVIDENCIA','PUDAHUEL','QUILICURA','QUINTA NORMAL','RECOLETA','RENCA','SANTIAGO','SANTIAGO CENTRO','TILTIL']), 'NOR-PONIENTE'
union all
select unnest(array['LA REINA','LAS CONDES','LO BARNECHEA','MACUL','PENALOLEN','SAN JOSE DE MAIPO','VITACURA']), 'NOR-ORIENTE'
on conflict (comuna) do nothing;