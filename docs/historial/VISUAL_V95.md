# V9.5 VISUAL

Stamp: `v-BS-PLATFORM-V9.5-VISUAL`

## Guía de diseño aplicada (field apps 2026)

- **Glanceable**: saludo + zona en una línea, sin tarjeta blanca
- **Thumb zone**: bottom nav + CTAs grandes
- **Zero chrome**: sin barras decorativas que no son acción
- **Lista sobre grilla** en catálogo móvil (más legible con un pulgar)
- **Buyers**: filas flex limpias (nombre truncado + meta a la derecha)

## Cambios

1. **Header** — `bs-topbar` sticky transparente; zona es texto con color, no pastilla
2. **Stock compradores** — lista de filas, no tabla rota
3. **Catálogo** — cards horizontales, lista por defecto, tipografía clara

## Deploy

```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V95_VISUAL.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.5: topbar limpio, buyers list, catalog list UX"
git push
```

Hard refresh → stamp `v-BS-PLATFORM-V9.5-VISUAL`
