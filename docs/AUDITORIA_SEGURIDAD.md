# Auditoría de seguridad

Revisión del repositorio de GitHub (V15.x) y del diseño de la 2.0.
10 de septiembre de 2026.

---

## 1 · Credenciales expuestas: no hay ninguna

Buscado en los 461 archivos del repositorio:

| Qué se buscó | Resultado |
|---|---|
| JWT (`eyJ…`) en cualquier archivo | **ninguno** |
| Archivos `.env` versionados | sólo `.env.example`, sin valores reales |
| `service_role` en código que llega al navegador | **ninguno** |
| `.gitignore` | correcto: `.env` y `.env.*` excluidos, `.env.example` permitido |

**Los usos de `service_role` están todos del lado del servidor**, que es
donde corresponde:

| Archivo | Dónde corre | Cómo lee la llave |
|---|---|---|
| `apps/control-center/api/*.js` | Funciones serverless de Vercel | `process.env.SUPABASE_SERVICE_ROLE_KEY` |
| `supabase/functions/notificar-catalogo` | Edge Function (Deno) | `Deno.env.get()` |
| `scripts/KEYFOODS_*.py` | Colab | Secrets de Colab |
| `.github/workflows/etl.yml` | GitHub Actions | `${{ secrets.… }}` |

Ninguno de esos archivos entra al bundle del navegador. Vercel ejecuta
`api/` en el servidor, no lo sirve como estático.

**Conclusión: nadie puede copiar tu data sacando una llave del código.**

## 2 · Lo que sí encontré

**El tenant se elige con una variable de build.** En la 15.x hay
`VITE_TENANT_KEYFOODS_URL` y `VITE_TENANT_KEYFOODS_ANON_KEY`. Eso
significa que el aislamiento entre empresas depende de a qué proyecto
apunte el build. Con dos clientes es manejable; con veinte es un
despliegue por empresa y un error de configuración basta para que una
vea a la otra.

En la 2.0 esto no existe: hay **un solo proyecto**, el tenant sale del
JWT y lo escribe el servidor. No hay variable de entorno que puedas
cambiar para apuntar el front a otra empresa.

**La anon key va en el navegador y eso está bien**, pero sólo mientras
la RLS esté correcta. La anon key no es un secreto: es un identificador
público. Lo que impide que alguien la use para bajarse tu base es la
política de cada tabla. Por eso `compliance.diagnostico()` es
bloqueante: si aparece una tabla sin política, el despliegue no se
promueve.

## 3 · Las seis capas de la 2.0

| # | Capa | Qué detiene |
|---|---|---|
| 1 | Sólo `api` expuesto a PostgREST | Una tabla nueva no queda publicada por accidente |
| 2 | RLS `ENABLE` + `FORCE` en todas las tablas | Un `WHERE` olvidado no cruza entre empresas. `FORCE` aplica también al dueño |
| 3 | `tenant_id` desde el JWT, nunca por parámetro | El cliente no puede pedir otra empresa. El diagnóstico falla si alguien agrega una función que lo acepte |
| 4 | Permiso por rol | El ejecutivo no ve costos ni edita precios |
| 5 | Suscripción vigente | Sin plan no hay filas, aunque todo lo demás esté bien |
| 6 | Cliente propio (`es_mi_cliente`) | Un ejecutivo no escribe sobre la cartera de otro |

Las seis están verificadas con pruebas: un usuario de la empresa A que
manipula su token para pedir la empresa B obtiene **cero filas**.

## 4 · Sobre "que nadie la pueda clonar"

Hay que separar dos cosas, porque se protegen distinto.

**El código del front NO se puede proteger.** Cualquier app web se
descarga entera al navegador. Se puede minificar y ofuscar, y eso sólo
molesta un poco a quien quiera copiarla. Nadie ha resuelto esto: ni
Gmail, ni Notion, ni Salesforce.

**Los datos SÍ se protegen, y ahí está todo.** Alguien puede copiar tus
pantallas; no puede copiar la cartera de KeyFoods, ni sus precios, ni su
histórico de venta. Y sin datos, una copia de las pantallas no vale
nada: es un cascarón.

Lo que de verdad defiende el producto:

- **Los datos de tus clientes**, protegidos por las seis capas de arriba.
- **La lógica de negocio**, que vive en la base y no en el navegador:
  la regla de elegibilidad, el signo de las notas de crédito, la
  reconciliación, el linaje. Copiando el front no se llevan nada de eso.
- **El contrato de los 4 archivos y el motor de carga**, que es lo que
  hace que una distribuidora esté operando en un día. Eso costó
  descubrirlo con datos reales y no está en ningún repositorio público.

## 5 · Pendientes antes de vender a la segunda empresa

| Prioridad | Qué |
|---|---|
| Alta | **Rotar la `service_role` de KeyFoods.** Ha estado en Colab, en Actions y en varios computadores. Rotarla es gratis y corta cualquier copia vieja |
| Alta | **MFA obligatorio para el superadmin.** Tu cuenta abre todas las empresas |
| Alta | Configurar el hook de token (027) y quitar `public` de los esquemas expuestos |
| Media | Límite de sesión y expiración corta del refresh token en terreno: un teléfono se pierde |
| Media | Alerta cuando `compliance.diagnostico()` deja de estar en 8/8 |
| Media | Backups automáticos verificados. Un backup que nunca se restauró no es un backup |
| Baja | Ofuscar el bundle. Sirve poco, no molesta |

## 6 · Lo que el guard ya impide

`npm run verify` rompe el build de las dos apps si encuentra:

- Un `select('*')`
- Algo que parezca una `service_role` o un JWT
- `!important` fuera de la excepción documentada
- `var(--x)` dentro de un SVG embebido
- `p_tenant` en una llamada que no sea de superadmin

Esa última regla es la que impide, mecánicamente, que alguien
reintroduzca el patrón de la 15.x sin darse cuenta.
