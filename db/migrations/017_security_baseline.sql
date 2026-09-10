-- ═══════════════════════════════════════════════════════════════════
-- 017 · LÍNEA BASE DE SEGURIDAD
-- Del paquete legal V1 (013), movido a `compliance` y con los códigos
-- alineados a los controles que esta arquitectura implementa de verdad.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance.control_baseline (
  codigo      TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  bloqueante  BOOLEAN NOT NULL DEFAULT TRUE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  implementado_en TEXT              -- dónde vive el control
);

INSERT INTO compliance.control_baseline (codigo, descripcion, bloqueante, implementado_en) VALUES
 ('RLS_FAIL_CLOSED',       'Toda tabla con datos tiene ENABLE + FORCE RLS y política por tenant', TRUE,  '012'),
 ('SIN_SELECT_STAR',       'El código productivo declara columnas explícitas',                    TRUE,  'guard R7'),
 ('SIN_SECRETOS_EN_REPO',  'Ninguna credencial, JWT o service key en control de versiones',       TRUE,  'guard R8'),
 ('DEFINER_SEARCH_PATH',   'Toda función SECURITY DEFINER fija su search_path',                   TRUE,  '019'),
 ('DEFINER_REVOKE_PUBLIC', 'Las funciones privilegiadas revocan EXECUTE de PUBLIC',               TRUE,  '013/014'),
 ('TOKEN_HASHEADO',        'El catálogo público guarda hash, no el token',                        TRUE,  '009/014'),
 ('TOKEN_EXPIRABLE',       'Los tokens expiran y se pueden revocar',                              TRUE,  '009'),
 ('RATE_LIMIT_PUBLICO',    'Catálogo y pedido público tienen límite de intentos',                 TRUE,  '014'),
 ('AUDITORIA_SENSIBLE',    'Las acciones administrativas dejan evidencia inmutable',              TRUE,  '015'),
 ('PRIVACIDAD_POR_DEFECTO','Los datos personales viven aparte y requieren permiso',               TRUE,  '005/012'),
 ('RETENCION_DEFINIDA',    'La retención está definida por finalidad y tipo de dato',             TRUE,  '018'),
 ('RESPUESTA_INCIDENTES',  'Los incidentes tienen flujo con plazo de 72 h',                       TRUE,  '016'),
 ('REGISTRO_ENCARGADOS',   'Los terceros que tratan datos están registrados',                     TRUE,  '016'),
 ('COMPUERTA_PUBLICACION', 'Ningún lote llega a producción sin reconciliación aprobada',          TRUE,  '010'),
 ('LINAJE_TRAZABLE',       'Toda cifra publicada apunta a su lote de origen',                     TRUE,  '010')
ON CONFLICT (codigo) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      bloqueante  = EXCLUDED.bloqueante,
      implementado_en = EXCLUDED.implementado_en;

-- RLS de esta tabla, acá y no en 012: 012 ya pasó cuando esta tabla se
-- crea. Es un catálogo de la plataforma: se lee, no se escribe desde la app.
ALTER TABLE compliance.control_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.control_baseline FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS control_baseline_lectura ON compliance.control_baseline;
CREATE POLICY control_baseline_lectura ON compliance.control_baseline FOR SELECT USING (true);
