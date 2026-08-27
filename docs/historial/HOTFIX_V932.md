# V9.3.2 — Data isolation + catálogo

Stamp: `v-BS-PLATFORM-V9.3.2`

## Bugs de data

| Problema | Causa | Fix |
|----------|-------|-----|
| Stock mezcla NOR-ORIENTE con ZONA SUR | Cargaba **toda** la cartera de la compañía | Filtra por `ejecutivo_id` + `zonaVista` (query + client + findBuyers) |
| Match flojo de nombres | 1 token de 5 letras bastaba | Exige 2 tokens o 1 ≥ 6 chars |
| Catálogo "no disponible" | RPC / `activo` / grants | `sql/23_DATA_ISOLATION_CATALOGO.sql` |

## Deploy

### 1) Supabase (obligatorio para catálogo)
Run: `sql/23_DATA_ISOLATION_CATALOGO.sql`  
Al final muestra 5 ofertas y una prueba de RPC. Si `prueba_rpc` tiene `ok: true` e `items`, el link público funciona.

### 2) GitHub
```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V93_2_DATA.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.3.2: stock buyers solo cartera del ejecutivo + catalog SQL"
git push
```

### 3) Hard refresh → `v-BS-PLATFORM-V9.3.2`

### 4) Probar
- Stock NOR-ORIENTE → compradores solo de esa zona
- Cambiar a ZONA SUR → otra lista
- Catálogo link en incógnito
