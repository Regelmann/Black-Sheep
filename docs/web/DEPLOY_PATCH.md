# Patch web — WhatsApp + legales + pricing UF

## Qué incluye
- Botón flotante WhatsApp → +56 9 3218 8569
- Páginas /privacidad /terminos /datos
- Footer con links legales reales
- Pricing: 2 planes **Campo (6 UF)** y **Comando (10 UF)**, toggle mensual/anual (−2 meses)
- Formulario demo corregido (grid estable)
- Favicon = logo
- PageLoader con logo (ya en /brand/logo-mark.png)
- next.config monorepo root

## Subir
```bash
cd ~/Black-Sheep/Black-Sheep
# copiar contenido de web/ sobre apps/web
cp -a web/. apps/web/
cd apps/web && npm i && npm run build
cd ../.. && git add apps/web && git commit -m "Web: WA, legales, pricing UF 6/10" && git push
```
