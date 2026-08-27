# V9.8 Design System Premium

Stamp: `v-BS-PLATFORM-V9.8-DS`

## Qué incluye
- `styles/tokens.css` — tokens premium (única fuente)
- `styles/system.css` — componentes canónicos
- `DESIGN_SYSTEM.md` — contrato de producto
- Import order: index → v90-fixes → ds-2026 → **system** (manda)

## Deploy
```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V98_DS.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.8: Design System Premium (tokens + system.css)"
git push
```

Hard refresh → stamp `v-BS-PLATFORM-V9.8-DS`
