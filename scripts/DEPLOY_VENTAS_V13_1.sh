#!/usr/bin/env bash
set -euo pipefail

# Black Sheep V13.1 — deploy seguro ZIP -> repo -> verify -> GitHub.
# No hace push si verify falla. No usa rsync --delete sin dry-run previo.

REPO_DIR="${1:-$HOME/Black-Sheep/Black-Sheep}"
ZIP="${2:-}"
COMMIT_MSG="${3:-feat: Black Sheep V13.1 ventas integral y UX}"
TMP="/tmp/black-sheep-v13.1"

cd "$REPO_DIR"
git rev-parse --is-inside-work-tree >/dev/null
git remote get-url origin >/dev/null

if [[ -z "$ZIP" ]]; then
  echo "Uso: $0 <repo> <zip> [commit-message]"
  echo "Ejemplo:"
  echo "  $0 ~/Black-Sheep/Black-Sheep /c/Users/.../BLACKSHEEP_V13_1_CLEAN_FINAL.zip"
  exit 2
fi

[[ -f "$ZIP" ]] || { echo "ERROR: ZIP no encontrado: $ZIP"; exit 1; }

rm -rf "$TMP"
mkdir -p "$TMP"
unzip -q "$ZIP" -d "$TMP"

required=(
  "$TMP/apps/field/src"
  "$TMP/apps/field/package-lock.json"
  "$TMP/apps/web/package-lock.json"
  "$TMP/scripts/CICLO_UNICO.py"
  "$TMP/sql/44_VENTAS_INTEGRACION_TOTAL.sql"
  "$TMP/sql/46_VENTAS_REPORTES_APP.sql"
  "$TMP/apps/field/src/pages/Ventas.jsx"
  "$TMP/apps/field/src/lib/buildStamp.js"
  "$TMP/README.md"
  "$TMP/VERSION"
)
for f in "${required[@]}"; do
  [[ -e "$f" ]] || { echo "ERROR: falta ${f#$TMP/}"; exit 1; }
done

echo "== BLACK SHEEP V13.1 — PRECHECK =="
echo "Repo: $(pwd)"
echo "Branch: $(git branch --show-current)"
echo "Origin: $(git remote get-url origin)"
echo "Version ZIP: $(cat "$TMP/VERSION")"

echo
echo "Estado Git antes de tocar la repo:"
git status --short

read -r -p "¿Continuar con dry-run? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || exit 0

python3 -m py_compile "$TMP/scripts/CICLO_UNICO.py"

# Nunca sincronizar basura local del build/entorno.
RSYNC_EXCLUDES=(
  --exclude='.git'
  --exclude='node_modules'
  --exclude='dist'
  --exclude='.env'
  --exclude='.next'
  --exclude='__pycache__'
  --exclude='*.pyc'
  --exclude='*.zip'
)

echo
echo "== RSYNC DRY-RUN =="
rsync -avhn --delete "${RSYNC_EXCLUDES[@]}" "$TMP/" "$REPO_DIR/"

echo
echo "Si ves un 'deleting' inesperado, cancela ahora."
read -r -p "¿Aplicar sincronización real? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || exit 0

rsync -av --delete "${RSYNC_EXCLUDES[@]}" "$TMP/" "$REPO_DIR/"

# Validación local del ETL.
python3 -m py_compile "$REPO_DIR/scripts/CICLO_UNICO.py"

# Verify Field con las dependencias del lockfile.
cd "$REPO_DIR/apps/field"
npm ci
npm run verify

# Verify Web: no asumir que Field es toda la aplicación.
cd "$REPO_DIR/apps/web"
npm ci
npm run lint
npm run typecheck
npm run build

cd "$REPO_DIR"

echo
echo "== REVISIÓN FINAL =="
git status --short
echo
echo "Eliminaciones:"
git status --short | grep '^D' | head -80 || true
echo
echo "Diff stat:"
git diff --stat

read -r -p "¿Todo correcto? Crear commit y push. [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || { echo "Cambios quedan locales; no hubo push."; exit 0; }

git add -A
git diff --cached --check
git commit -m "$COMMIT_MSG"
git push origin "$(git branch --show-current)"

echo
echo "== PUSH COMPLETADO =="
git log -1 --oneline
git status --short
