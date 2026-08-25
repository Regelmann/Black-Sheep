# BLACK SHEEP · V8.1-OP

Stamp: `v-BS-PLATFORM-V8.1-OP` · **Build verde**

## Qué trae

| Fix | Detalle |
|-----|---------|
| Visita | Check-in **solo** en sticky (zona pulgar); arriba Llamar/WhatsApp + estado |
| ClientActionBar | Grid 4 columnas: Llamar · WhatsApp · Nota · Visita (Cartera) |
| Stock | `safeSelect` + error visible + Reintentar (ya no "0 clientes" silenciosos) |
| Catálogo | `safeRpc` + SQL `01_FIX_CATALOGO_ACTIVA.sql` |
| tenants | Guard anti `var(--brand)` circular |
| esNombreProducto / pctAvanceFoco | Restaurados |
| query.js | Wrapper para no tragar errores PostgREST |

## 1) Supabase (obligatorio para catálogo)

SQL Editor → Run: `sql/01_FIX_CATALOGO_ACTIVA.sql`

## 2) GitHub (Git Bash)

```bash
cd ~/Downloads
unzip -o BLACKSHEEP_V81_OP.zip

cd ~/Black-Sheep/Black-Sheep
cp -R ~/Downloads/BLACKSHEEP/* .

git add -A
git status
git commit -m "V8.1-OP: action bar, stock errors, visita check-in, catalog"
git push
```

Si el zip se descomprimió en otra carpeta, ajustá el `cp`.

## 3) Después del deploy

1. Hard refresh → stamp `v-BS-PLATFORM-V8.1-OP`
2. Catálogo: actualizar oferta → abrir link
3. Stock: Encontrar compradores (si falla query, verás el error real)
4. Cartera: expandir cliente → 4 botones alineados
5. Visita: un solo Check-in abajo

## Dashboard

`black-sheep.cl/dashboard` redirige a la app. Gerencia = **Más → Gerencia**.
