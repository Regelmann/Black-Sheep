# Black Sheep Web 2026 — black-sheep.cl

Landing Next.js (App Router) con:

- Cursor glow, scroll progress, reveal, magnetic CTAs
- Hero con grafo de red (dynamic import, sin SSR)
- Bento features, pricing, ROI, FAQ, formulario de leads
- **Paleta Black Sheep premium:** fondo cálido oscuro + cobre `#ea580c` (marca field)

## Requisitos

- Node 20+
- Cuenta Vercel
- (Opcional) Postgres si querés persistir leads; si no, el API puede loguear o usar un webhook

## Deploy en Vercel (recomendado)

1. Subí esta carpeta a un repo o a una carpeta `apps/web-next` del monorepo.
2. En Vercel → **Add New Project** → importá el repo.
3. **Root Directory:** la carpeta de este proyecto (donde está `package.json` con `"name": "blacksheep-web"`).
4. Framework: Next.js (auto).
5. Domain: asigná `www.black-sheep.cl` y `black-sheep.cl` a **este** proyecto (no al field app).
6. Deploy.

Variables opcionales (leads / DB):

```
DATABASE_URL=postgresql://...
```

Sin DB el build igual funciona; el endpoint `/api/leads` fallará al guardar hasta configurar Postgres o adaptar el handler a un webhook (Formspree, Resend, etc.).

## Local

```bash
cd blacksheep-web   # esta carpeta
npm install
npm run dev
# http://localhost:3000
```

## Relación con app.black-sheep.cl

| Dominio | Proyecto Vercel | Stack |
|---------|-----------------|--------|
| black-sheep.cl / www | **este** Next.js | marketing |
| app.black-sheep.cl | monorepo `apps/field` | field PWA |

No mezclar root directories en el mismo proyecto Vercel.

## Colores (tokens)

| Token | Hex | Uso |
|-------|-----|-----|
| navy | `#0c0a09` | fondo |
| primary | `#ea580c` | CTA, acentos |
| primary-soft | `#fb923c` | hover / glow |
| mint | `#34d399` | éxito / pedidos |
| mist | `#fafaf9` | texto |
