# Black Sheep — Paquete único WEB + CATÁLOGO (2026)

Todo junto: landing de marketing y catálogo público premium.
No hace falta buscar ZIPs sueltos.

| Pieza | Carpeta | Dominio típico |
|-------|---------|----------------|
| Landing marketing | `web/` | `black-sheep.cl` / `www` |
| Catálogo del cliente | `catalogo/` → se copia al **field app** | `app.black-sheep.cl/catalogo/:token` |

---

## 1. Landing (`web/`)

### Stack
- Next.js (App Router) · React 19 · TypeScript
- Framer Motion · Tailwind CSS 4
- Paleta: carbón `#0c0a09` + cobre `#ea580c`

### Qué incluye
- **Fondos dinámicos** (`DynamicBackground`): orbes, grid, partículas, vignette
- **Pricing agresivo**: spring, plan destacado, shine, hover
- **Reveal / Stagger**: entrada al scroll
- Hero + grafo de red (dynamic import), Bento, Stats, FAQ, ROI, CTA leads
- API `/api/leads` (log en Vercel; Postgres opcional con `DATABASE_URL`)

### Componentes clave (`web/src/components/`)
```
DynamicBackground · AmbientGlow (reexport)
Hero · Navbar · Footer · Pricing
Reveal · Stagger · CursorGlow · ScrollProgress
BentoFeatures · Stats · FAQ · CTAForm · FloatingCTA
TrustBar · ProductShowcase · FlowSteps · …
```

### Subir landing a Vercel
```bash
cd web
npm install
npm run dev          # local http://localhost:3000
npm run build        # verificar

# Vercel: New Project → Root Directory = web/
# Dominios: black-sheep.cl y www.black-sheep.cl
```

Variables opcionales:
```
DATABASE_URL=postgresql://...   # solo si querés guardar leads
```

---

## 2. Catálogo público (`catalogo/`)

### Qué es
La página que ve el **cliente final** con el link que manda el vendedor
(` /catalogo/{token}` en la app field).

### Stack
- React (Vite) dentro de `apps/field`
- CSS premium dark (mismo lenguaje que el landing)
- Supabase RPC: `get_public_catalogo` · `crear_pedido_publico`

### Archivos a copiar al repo field
```
catalogo/apps/field/src/pages/CatalogoCliente.jsx
catalogo/apps/field/src/styles/catalogo-public.css
```

El JSX ya importa:
```js
import '../styles/catalogo-public.css'
```

### Integrar en el monorepo field
```bash
# desde la raíz de este ZIP
REPO=~/Black-Sheep/Black-Sheep   # ajustá tu ruta

cp catalogo/apps/field/src/pages/CatalogoCliente.jsx \
   $REPO/apps/field/src/pages/

mkdir -p $REPO/apps/field/src/styles
cp catalogo/apps/field/src/styles/catalogo-public.css \
   $REPO/apps/field/src/styles/

cd $REPO
git add apps/field/src/pages/CatalogoCliente.jsx \
        apps/field/src/styles/catalogo-public.css
git commit -m "Catálogo público premium 2026"
git push
```

### Qué se ve / hace
- Hero gradient + marca
- Búsqueda + chips de categoría
- Secciones: habituales · reposición · ofertas · resto
- Precio: negociado → histórico → lista → consultar
- Carrito FAB + drawer + envío de pedido
- Ficha producto (imagen, reseña, precio)

### Lógica que NO cambia
- Token público
- RPCs de Supabase
- Orden de precios

---

## 3. Orden recomendado hoy

1. **Deploy landing** (`web/` → Vercel → black-sheep.cl)
2. **Copiar catálogo al field** → push → hard refresh en un link real
3. Probar en el teléfono: catálogo + agregar + enviar pedido

---

## 4. Mapa de dominios

| URL | Proyecto Vercel | Carpeta de este ZIP |
|-----|-----------------|---------------------|
| black-sheep.cl | Landing Next | `web/` |
| www.black-sheep.cl | Landing Next | `web/` |
| app.black-sheep.cl | Field Vite (ya existe) | solo se **parchean** 2 archivos de `catalogo/` |
| app…/catalogo/:token | Mismo field | `CatalogoCliente` |

No mezclar Root Directory: landing y field son **dos proyectos** (o dos roots).

---

## 5. Checklist de humo

### Landing
- [ ] Home carga con fondo animado
- [ ] Pricing: hover en plan Equipo
- [ ] Formulario demo envía (ok en network)
- [ ] Mobile: nav y CTA flotante

### Catálogo
- [ ] Link `/catalogo/{token}` abre con nombre del cliente
- [ ] Productos y precios visibles
- [ ] Filtro categoría + búsqueda
- [ ] Agregar al carrito → enviar pedido
- [ ] Pedido aparece en inbox / Supabase

---

## 6. Si algo falla

| Problema | Qué revisar |
|----------|-------------|
| Landing en blanco | `npm run build` en `web/`; Node 20+ |
| Leads no guardan | Normal sin `DATABASE_URL` (van a logs Vercel) |
| Catálogo “no existe” | RPC `get_public_catalogo` + token válido en SQL |
| Catálogo sin estilos | ¿Está `catalogo-public.css` y el import en el JSX? |
| Precios en 0 | Lista de precios en ciclo + `oferta_cliente_items` |

---

Versión de este paquete: **WEB_MOTION + CATÁLOGO_PREMIUM_2026** unificados.

---

## Animaciones de carga (esta versión)

### Landing (`web/`)
- `PageLoader` — splash con logo BS, barra 0→100%, fade al contenido (~1.2 s)
- `Skeleton` / `CardSkeleton` — shimmer reutilizable
- Respeta `prefers-reduced-motion` (salta el splash)

### Catálogo
- Boot con anillo pulse + barra
- Grid de 4 skeleton cards con shimmer mientras llega el RPC
