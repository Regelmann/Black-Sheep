-- ═══════════════════════════════════════════════════════════════════
-- 000 · EXTENSIONES
-- Idempotente. Primera migración de la App 2.0.
-- ═══════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid, digest, hmac
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- búsqueda por nombre de cliente/producto

-- En Supabase pgcrypto suele estar en el esquema `extensions`; en una
-- instalación estándar queda en `public`. Las funciones que la usan
-- listan ambos esquemas en su search_path (ver 014).
