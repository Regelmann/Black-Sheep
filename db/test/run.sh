#!/usr/bin/env bash
# Corre migraciones y pruebas sobre una base desechable. NUNCA producción.
set -euo pipefail
DB="${1:-bs2}"; D="$(dirname "$0")"
dropdb --if-exists "$DB"; createdb "$DB"
psql -q -d "$DB" -f "$D/00_shim_supabase.sql"
for f in "$D"/../migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null; echo "OK  $(basename "$f")"
done
echo "--- idempotencia ---"
for f in "$D"/../migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null || { echo "NO IDEMPOTENTE: $f"; exit 1; }
done
echo "--- seguridad y aislamiento ---"; psql -q -d "$DB" -f "$D/01_smoke.sql"
echo "--- ciclo de carga ---";          psql -q -d "$DB" -f "$D/02_ciclo.sql"
echo "--- edición dashboard ---";     psql -q -d "$DB" -f "$D/03_dashboard.sql"
echo "--- precios ---";              psql -q -d "$DB" -f "$D/04_precios.sql"
echo "--- segundo tenant ---";       psql -q -d "$DB" -f "$D/05_segundo_tenant.sql"
echo "--- diagnóstico ---";             psql -q -d "$DB" -c 'select * from compliance.diagnostico();'
