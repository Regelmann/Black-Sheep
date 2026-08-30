# V9.4 UX — cambios visuales reales

Stamp: `v-BS-PLATFORM-V9.4-UX`

Los hotfixes V9.3.x fueron de **datos**. Este paquete es **estética + catálogo SQL**.

## Qué cambia a simple vista

1. **Zona** — se eliminó la pastilla "N-Oriente". Solo queda el texto de color bajo "Hola, Sebastián" (tocable para cambiar).
2. **Clientes / stats** — grilla de **4 columnas** (2 filas), chips más chicos.
3. **Filtros** — más compactos y con aire respecto al buscador.
4. **Hoy** — DecisionCards más densas.
5. **Botones Llamar/WA/Nota** — grilla 4 columnas fija.
6. **Catálogo** — `sql/24_CATALOGO_COLS_REALES.sql` (sin columna `recomendado`).

## Deploy

### 1) Supabase
Run: `sql/24_CATALOGO_COLS_REALES.sql`

### 2) Código
```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V94_UX.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.4-UX: zone text-only, stats 2 rows, denser cards, catalog cols"
git push
```

### 3) Vercel Ready → hard refresh / cerrar PWA
Stamp debe decir: **v-BS-PLATFORM-V9.4-UX**

Si sigue viendo la pastilla N-Oriente, el deploy viejo sigue en producción.
