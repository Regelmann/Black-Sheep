# V9.4.1 — Catálogo visible + Stock compradores

Stamp: `v-BS-PLATFORM-V9.4.1`

## Qué estaba roto (de verdad)

| Síntoma | Causa raíz |
|---------|------------|
| Catálogo negro con "19 resultados" | Faltaba CSS `.bs-shop-grid` + placeholder SVG con `var()` inválido → cuadrados negros |
| Stock "vista desactualizada" | `select` pedía columnas que no existen; ahora prueba 4 sets hasta uno que funcione |
| RPC `recomendado` | Columna no existe; SQL 24 usa `destacado` |

## Deploy

### 1) Supabase (si el catálogo público aún falla)
Run: `sql/24_CATALOGO_RPC_FINAL.sql`

### 2) Código
```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V94_1_FIX.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.4.1: catalog grid visible + stock progressive select"
git push
```

### 3) Hard refresh → `v-BS-PLATFORM-V9.4.1`

### 4) Probar
- Link catálogo: grilla 2 columnas, precios, + Agregar
- Stock → Encontrar compradores: clientes de TU zona o "0", no error de configuración
