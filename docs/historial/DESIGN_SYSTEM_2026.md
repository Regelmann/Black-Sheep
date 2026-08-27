# Black Sheep Field — Design System 2026

Stamp: `v-BS-PLATFORM-V9.6-SYSTEM`

## Referencias (no inventadas)

| Fuente | Qué tomamos |
|--------|-------------|
| **Linear** | Accent bar 3px de estado, densidad controlada, un acento de color |
| **Attio** | Cards “papel”: sombra suave `0 1px 3px`, sin bordes gruesos |
| **SalesSheet / CRM móvil** | `tabular-nums` en montos, pills de estado pastel |
| **Field Service 2026** | Thumb zone, bottom nav 4–5 tabs, CTA primaria abajo |
| **Thumb-zone research** | Targets ≥ 44px, acciones en tercio inferior |

## Principios

1. **Glanceable** — el vendedor entiende el status en < 1 s
2. **Una acción primaria por pantalla**
3. **Zero chrome** — si no es acción, no ocupa espacio
4. **Soft depth** — profundidad con sombra, no con cajas blancas decorativas
5. **Escala fija** — spacing 4/8/12/16, radios 6/10/14/18, sombras xs/sm/md

## Archivos

- `styles/tokens.css` — escala space / radius / shadow / type
- `styles/ds-2026.css` — componentes canónicos (cards, decision, nav, stats, chips, clients)
- `styles/v90-fixes.css` — hotfixes previos (no borrar)
- `components/domain/ZonePicker.jsx` — topbar una línea

## Deploy

```bash
cd ~/Downloads
rm -rf _bs && mkdir _bs
unzip -q BLACKSHEEP_V96_SYSTEM.zip -d _bs

cd ~/Black-Sheep/Black-Sheep
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' \
  ~/Downloads/_bs/ ./

git add -A
git commit -m "V9.6: Design System 2026 (Linear/Attio/thumb-zone)"
git push
```

Hard refresh → stamp `v-BS-PLATFORM-V9.6-SYSTEM`
