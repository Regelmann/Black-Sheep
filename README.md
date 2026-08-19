# Black Sheep Field — Plataforma multi-empresa

Producto de **venta en ruta + catálogo + gerencia**.  
**Black Sheep** es la marca y la puerta de entrada. Cada empresa (tenant) entra solo por aquí.

## Estructura

```
├── brand/                 # logos oficiales
├── apps/
│   ├── web/               # blacksheep.cl — marketing + login
│   └── field/             # app.blacksheep.cl — Field multi-tenant
├── docs/ARCHITECTURE.md   # diseño multi-empresa
└── README.md
```

## Deploy

### 1. Sitio — blacksheep.cl
- Vercel → root `apps/web`
- En `login.html`: `window.BS_APP_URL = "https://app.blacksheep.cl"`

### 2. App — app.blacksheep.cl
- Vercel → root `apps/field`
- Env mínimas (tenant KeyFoods = default):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
```

Opcional segundo tenant:

```
VITE_TENANT_DEMO_URL=...
VITE_TENANT_DEMO_ANON_KEY=...
```

### 3. Supabase por empresa
En el proyecto de cada tenant, en orden:

1. `apps/field/scripts/SUPABASE_FIX_STOCK_PRECIOS.sql`
2. `apps/field/scripts/SUPABASE_COMMERCE_V56_16_CANON.sql`

Precios: `KEYFOODS_PATCH_STOCK_PRECIOS.py` (v5) con service key de **ese** proyecto.

## Login

1. Usuario → blacksheep.cl → Ingresar  
2. Elige empresa / se detecta por email  
3. App resuelve tenant → Supabase correcto → sesión  

Stamp: **`v-BS-PLATFORM-MT`**

## Documentación

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
