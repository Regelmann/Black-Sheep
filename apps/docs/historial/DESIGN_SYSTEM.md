# Black Sheep Field — Design System Premium v9.8

## Principios
1. **Glanceable** — status en < 1 s
2. **Una CTA primaria** por pantalla
3. **Thumb zone** — nav y acciones abajo
4. **Soft depth** — sombra Attio, no bordes gruesos
5. **Accent 3px** — estado Linear en decision cards
6. **Tabular nums** — montos alineados
7. **Tokens only** — cero hex en JSX

## Archivos canónicos
| Archivo | Rol |
|---------|-----|
| `styles/tokens.css` | Color, type, space, radius, shadow |
| `styles/system.css` | Componentes primitivos |
| `index.css` | Layout legacy + páginas |
| `styles/v90-fixes.css` / `ds-2026.css` | Compat; no agregar reglas nuevas aquí |

## Componentes
- **Hero** `.bs-hero` / `.bs-page-hero` — gradiente oscuro, kicker, título, ZoneChip
- **ZoneChip** — solo dentro del hero
- **Card** `.bs-card`
- **Decision** `.bs-dc` + `::before` 3px
- **Buttons** `.bs-btn-primary` / `.bs-btn-secondary`
- **Chips** `.bs-chip` / `.bs-chips`
- **Stats** `.bs-statgrid` / `.bs-stat`
- **Client row** `.cli-card`
- **Nav** `.navbar` / `.bs-nav` — fixed bottom + safe-area
- **Sheet** zone bottom sheet
- **Action bar** 4 columnas contacto

## Escala
- Space: 4 · 8 · 12 · 16 · 20 · 24 · 32
- Radius: 6 · 10 · 14 · 18 · 24 · full
- Shadow: xs · sm · md · lg
- Touch: 44 / 48

## Reglas de implementación
- Nuevas UI solo con clases del system.
- No crear franjas globales de zona.
- No duplicar saludo (hero único).
- Stamp de release en `BUILD_STAMP`.
