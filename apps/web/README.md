# Black Sheep Web — React / Next.js completo

Landing de marketing para **black-sheep.cl**.

Stack: Next.js (App Router) · React 19 · Framer Motion · Tailwind CSS 4 · TypeScript

## Arranque

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # producción
```

## Estructura React

```
src/
  app/
    layout.tsx          # fonts, metadata, shell
    page.tsx            # página home: compone todas las secciones
    globals.css         # tokens + utilidades
    error.tsx
    api/health/route.ts
    api/leads/route.ts  # formulario demo (log o Postgres opcional)
  components/           # 33 componentes React client/server
    DynamicBackground   # fondos dinámicos (orbes, grid, partículas)
    AmbientGlow         # reexport → DynamicBackground
    Hero                # hero + grafo de red (dynamic import)
    Pricing             # planes con motion agresivo
    Reveal / Stagger    # sistema de entrada al viewport
    Navbar, Footer, FAQ, CTAForm, …
  db/                   # drizzle opcional para leads
```

## Secciones en `page.tsx` (orden)

1. DynamicBackground  
2. ScrollProgress · CursorGlow · Navbar  
3. Hero · TrustBar · ProblemCost · Comparison  
4. FlowMarquee · ProductShowcase · BentoFeatures · Stats  
5. FlowSteps · VendorDay · ROICalculator · Integrations  
6. CaseStudy · Pricing · Testimonials · FAQ · CTAForm  
7. Footer · LiveToasts · FloatingCTA  

## Animación

- **Framer Motion** en Pricing, Hero, Stats, FAQ, fondos, Reveal/Stagger  
- Respeta `prefers-reduced-motion`

## Deploy Vercel

1. Root Directory = esta carpeta  
2. Framework: Next.js  
3. Dominios: `black-sheep.cl` / `www`  
4. Opcional: `DATABASE_URL` para persistir leads  

App de terreno: `app.black-sheep.cl` (proyecto aparte, Vite).
