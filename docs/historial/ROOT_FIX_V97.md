# V9.7 ROOT — por qué ahora sí se nota

## Causa raíz (no era CSS)

Había **dos encabezados apilados**:
1. `ZonePicker` global → franja "Hola + zona"
2. Hero de cada página → "Buenos días / Mi cartera" otra vez

Por eso ningún parche de color se sentía distinto: la estructura seguía igual.

## Cambio estructural

| Antes | Ahora |
|--------|--------|
| Barra blanca global de zona | **Eliminada** |
| Zona en franja separada | **ZoneChip dentro del hero** |
| Hoy: hero + muro de bloques | **1 hero + 1 decisión + ritmo compacto** |
| Focos siempre abiertos | **Dentro de `<details>`** |

Archivos tocados de raíz:
- `components/domain/ZonePicker.jsx` → ZoneProvider + ZoneChip
- `App.jsx` → sin topbar global
- `pages/Hoy.jsx` → shell reescrito
- `pages/Cartera.jsx` / `Gerencia.jsx` → ZoneChip en hero

Stamp: `v-BS-PLATFORM-V9.7-ROOT`

## Deploy

```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V97_ROOT.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.7 ROOT: sin barra zona global, Hoy 1-hero, ZoneChip en hero"
git push
```

Hard refresh **o cerrar la PWA por completo** (service worker).
Verificar stamp: `v-BS-PLATFORM-V9.7-ROOT`
