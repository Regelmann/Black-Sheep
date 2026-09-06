# Estructura objetivo del repositorio

```text
Black-Sheep/
├── apps/
│   ├── field/
│   │   └── src/
│   │       ├── config/           # configuración tenant / marca
│   │       ├── components/       # primitives visuales
│   │       ├── domain/           # reglas y módulos de negocio
│   │       ├── hooks/             # estado compartido
│   │       ├── lib/
│   │       │   ├── repos/         # acceso a datos
│   │       │   ├── security/      # contexto tenant / permisos
│   │       │   ├── sync/          # outbox / sincronización
│   │       │   └── reporting/     # clientes de vistas/RPC
│   │       ├── pages/              # composición de pantallas
│   │       └── styles/             # sistema visual
│   └── web/                        # superficie web
├── docs/
│   ├── architecture/
│   ├── historial/
│   └── tests-pendientes/
├── scripts/
│   ├── CICLO_UNICO.py
│   └── qa/
├── sql/
│   ├── foundation/                # esquema base
│   ├── security/                  # tenant, RBAC, RLS, diagnostics
│   ├── reporting/                 # vistas y RPC de lectura
│   └── *.sql                      # migraciones históricas vigentes
└── brand/
```

## Regla de dependencias

```text
pages → domain/components/hooks
pages → repos/services
repos → Supabase
security → JWT/RLS
ETL → Storage/service role
reporting → DB views/RPC
```

Una página no debe conocer detalles de columnas de diez tablas distintas.
