# Black Sheep Field — Sitio web (marketing + ingreso)

Landing negra / neón para **blacksheep.cl**.

## Contenido

| Archivo | Uso |
|---------|-----|
| `index.html` | Home: producto, capturas reales, CTA |
| `login.html` | Ingreso usuario → plataforma Field |
| `styles.css` | Design system void + neon `#39ff14` |
| `brand/` | Logo oveja (SVG + PNG) |
| `assets/` | Screenshots del producto en vivo |

## Deploy en Vercel

1. Proyecto nuevo apuntando a esta carpeta (o repo `blacksheep-web`).
2. Framework: Other (estático). Output: raíz.
3. Dominio: `blacksheep.cl` / `www.blacksheep.cl`.

## Conectar login → app Field

En `login.html`, antes del cierre de `</body>` o en un snippet Vercel:

```html
<script>window.BS_APP_URL = "https://app.blacksheep.cl";</script>
```

O el deploy actual de KeyFoods Field en Vercel. La app debe autenticar con Supabase y resolver el tenant del usuario.

## Colores

- Fondo: `#050505` / `#0a0a0a`
- Neón: `#39ff14`
- Texto: `#f4f4f5`
- Muted: `#a1a1aa`

Logo oficial: `brand/logo-mark.svg` (oveja circuit neón).
