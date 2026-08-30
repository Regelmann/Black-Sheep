# V9.3.1 HOTFIX

Stamp: `v-BS-PLATFORM-V9.3.1`

## Causa de los 3 bugs de las capturas

| Síntoma | Causa real |
|---------|------------|
| Stock · "vista desactualizada" / sin compradores | `select` pedía `razon_social` → columna no existe → query 400 → cartera vacía |
| Gerencia · "No cargó: stock · notas" | `stock` pedía `precio`; `notas_cliente` pedía `created_at` → no existen |
| Catálogo · "problema de configuración" | RPC `get_public_catalogo` no instalada o sin `activo` (SQL 20/22) |

## Pasos

### 1) Supabase (OBLIGATORIO)
SQL Editor → Run completo:
`sql/22_HOTFIX_V931.sql`

Debe devolver la función y un count de ofertas.

### 2) Código
```bash
cd ~/Downloads
unzip -o BLACKSHEEP_V93_1_HOTFIX.zip

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/BLACKSHEEP_V93_1_HOTFIX/ ./   # si el zip es root-level

# Si el zip trae carpeta raíz distinta:
# rsync -av --exclude=node_modules --exclude=dist PATH_AL_CONTENIDO/ ./

git add -A
git commit -m "V9.3.1: hotfix stock/gerencia selects + catalog SQL"
git push
```

### 3) Hard refresh
Stamp: `v-BS-PLATFORM-V9.3.1`

### 4) Probar
1. Stock → Encontrar compradores (clientes o "0 match", no error de configuración)
2. Gerencia → sin banner rojo de stock/notas (o solo si realmente falla otra cosa)
3. Catálogo link en incógnito → productos
