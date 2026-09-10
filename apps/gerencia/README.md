# Dashboard de gerencia

Front de la App 2.0. React + Vite. Lo usan dos audiencias con la misma
build: **gerencia de cada empresa** y **Black Sheep** como plataforma.
La diferencia la hace el JWT, no un despliegue distinto.

```bash
cp .env.example .env      # sólo URL y anon key
npm install
npm run dev
npm run verify            # guard + build. Nada se sube sin esto en verde
```

## Cómo está armado

```
src/lib/supabase.js   un solo cliente, esquema `api`, tenant desde el JWT
src/lib/query.js      safeSelect · ninguna consulta falla en silencio
src/lib/rpc.js        llamadas a funciones de api + errores en castellano
src/lib/excel.js      lee el Excel en el navegador (carga diferida)
src/hooks/useDatos.js puente safeSelect ↔ TanStack Query
src/hooks/useCapacidades.js  qué tiene contratado esta empresa
src/paginas/          Resumen · Carga · Conflictos · Datos · Equipo · Empresas
src/estilos/          tokens.css + app.css. Dos archivos, cero !important
```

## Decisiones

**Un solo cliente Supabase.** En la 15.x había uno por empresa, con su
URL y su key. Acá el tenant sale de `app_metadata.tenant_id` del token,
que escribe el servidor. No hay forma de apuntar el front a otra empresa
cambiando una variable de entorno.

**El front no decide qué está permitido.** Cada función de `api` valida
permiso, capacidad y suscripción en el servidor. Acá sólo se traduce el
error a algo legible. Ocultar un botón es comodidad, no seguridad.

**La navegación se dibuja desde las capacidades.** Una distribuidora que
no mide por SKU no ve "Focos" en gris: no existe la sección.

**El Excel no se interpreta en el navegador.** Se convierte a filas tal
cual y se mandan al servidor, que las guarda como evidencia y las
normaliza contra el contrato. Si el front interpretara, cada versión del
front produciría datos distintos con el mismo archivo.

**`xlsx` se carga sólo al abrir un archivo.** Pesa 429 kB: meterlo en el
bundle inicial castiga a todas las pantallas por una que se usa una vez
al día.

## El guard

`npm run verify` corre `scripts/guard.mjs` antes de construir. Rompe el
build si encuentra:

| Regla | Por qué |
|---|---|
| `select('*')` | Trae de más y se rompe en silencio cuando la vista cambia |
| Un secreto en el código | La `service_role` nunca va al navegador |
| `!important` en CSS | Salvo la excepción marcada de `prefers-reduced-motion` |
| `var(--x)` dentro de un SVG embebido | No resuelve: los pines salían negros |
| `p_tenant` en una llamada que no es `admin_*` | El tenant sale del JWT, no de un parámetro |

## Lo que falta

- **App de terreno** (`apps/field`): la PWA del vendedor, con cola offline.
- **Resumen**: está la pantalla base; faltan los paneles de integridad.
- **Subir el archivo original a Storage** para conservarlo como evidencia
  (hoy se guarda el hash y las filas, no el binario).
