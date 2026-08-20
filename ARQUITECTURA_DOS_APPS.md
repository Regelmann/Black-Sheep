# Black Sheep — 2 apps en Vercel (desde cero)

## Diagrama

```
black-sheep.cl          →  Proyecto Vercel WEB
  index.html              Landing
  login.html              Elige EMPRESA + email
         │
         │  redirect ?email=&tenant=
         ▼
app.black-sheep.cl      →  Proyecto Vercel FIELD
  Login.jsx               Password + Supabase del tenant
  Hoy / Mapa / ...        App de terreno
```

## Proyecto 1 — WEB (marketing + puerta)

| Setting | Valor |
|---------|--------|
| Root Directory | `apps/web` |
| Framework | Other |
| Build Command | *(vacío)* |
| Output Directory | `.` |
| Domain | `black-sheep.cl` + `www` |

### Config obligatoria en `login.html`

```js
window.BS_APP_URL = 'https://TU-URL-FIELD.vercel.app';
// cuando tengas dominio:
// window.BS_APP_URL = 'https://app.black-sheep.cl';
```

## Proyecto 2 — FIELD (app de ventas)

| Setting | Valor |
|---------|--------|
| Root Directory | `apps/field` |
| Framework | Vite |
| Install | `npm install --legacy-peer-deps --no-audit --no-fund` |
| Build | `npm run build` |
| Output | `dist` |
| Domain | `app.black-sheep.cl` |

### Env vars (Production)

```
VITE_SUPABASE_URL=...          # KeyFoods (default)
VITE_SUPABASE_ANON_KEY=...
VITE_PUBLIC_BRAND=KEYFOODS
VITE_GOOGLE_MAPS_API_KEY=...   # opcional
```

Opcional multi-tenant:

```
VITE_TENANT_DEMO_URL=...
VITE_TENANT_DEMO_ANON_KEY=...
```

## Flujo de usuario

1. Entra a **black-sheep.cl** (landing)
2. Clic **Entrar** → **login.html**
3. Elige **Empresa** (KeyFoods / Demo) + **Email**
4. **Continuar a la app** → redirige a Field con `?email=&tenant=`
5. En Field ingresa **contraseña** (auth Supabase de esa empresa)
6. Trabaja en Hoy / Mapa / Clientes / Stock / Gerencia

## Empresas y usuarios

- Cada **empresa** = 1 proyecto Supabase (aislado)
- Cada **usuario** se crea en Supabase Auth de **su** empresa
- El selector de empresa elige a qué Supabase conectar
- Para agregar empresa nueva: fila en `src/lib/tenants.js` + env vars + usuarios en ese Supabase

## Deployment Protection

Desactivado en **Production** de ambos proyectos (si no, pantalla en blanco / login Vercel).
