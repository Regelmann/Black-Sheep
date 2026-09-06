# Seguridad · Auditoría y modelo de acceso

**Versión auditada:** `v-BS-PLATFORM-V14.7` · septiembre 2026
**Alcance:** `apps/field` (PWA), `apps/web` (sitio + API), `sql/` (Supabase),
`scripts/` (ETL), `supabase/functions/` (Edge Function).

---

## 0 · La conclusión en una línea

**No hay una sola falla que exponga datos hoy.** Lo que hay es un diseño
que asume un único tenant y varios puntos donde la defensa depende de que
nadie se equivoque. Con un solo cliente, el impacto es interno (un
ejecutivo ve las metas de su par). Con el segundo cliente, cuatro de
estos hallazgos se convierten en fuga de datos entre empresas — y en
Chile eso cae bajo la **Ley 19.628**.

Lo que sigue está ordenado por **gravedad real**, no por cantidad de
trabajo. Los 🔴 son los que hay que cerrar antes de vender la segunda
instancia.

| # | Hallazgo | Severidad | Dónde |
|---|---|---|---|
| 1 | Políticas `USING (true)` vivas en la base | 🔴 Alta | `sql/13`, `14`, `15`, `17`, `19`, `20` |
| 2 | Funciones `SECURITY DEFINER` invocables por `anon` | 🔴 Alta | `sql/01`, `28`, `42` |
| 3 | `renombrar_zona` sin `SET search_path` | 🔴 Alta | `sql/42:157` |
| 4 | Tokens de catálogo que no vencen ni se pueden revocar | 🟠 Media | `sql/19` + RPCs |
| 5 | Endpoint anónimo de pedidos sin límite de velocidad | 🟠 Media | `sql/21` |
| 6 | Sin auditoría de accesos | 🟠 Media | — |
| 7 | URL de producción hardcodeada en el ETL | 🟠 Media | `scripts/KEYFOODS_CICLO_UNICO.py` |
| 8 | Autorización duplicada en cuatro lugares | 🟡 Baja | `App.jsx`, `Gerencia`, `Admin`, `NavBar` |
| 9 | Token del catálogo sin validar antes del RPC | 🟡 Baja | `CatalogoCliente.jsx`, `push.js` |
| 10 | Errores con la sesión completa en consola | 🟡 Baja | `query.js` y páginas |
| 11 | `window.open` sin `noopener` | 🟡 Baja | `PedidoSheet`, `pedido.js` |
| 12 | Sin cabeceras de seguridad (CSP / HSTS) | 🟡 Baja | `vercel.json`, `next.config.ts` |
| 13 | Escapado HTML duplicado | ⚪ Observación | `pedido.js` |
| 14 | `zonas` legible por `anon` | ⚪ Observación | `sql/42` |

---

## 1 · Cómo está construida la seguridad (lo que SÍ está bien)

Antes de los problemas, vale decir qué sostiene todo esto, porque no es
poco y es la razón por la que ningún hallazgo de arriba es crítico hoy:

- **Un proyecto Supabase por tenant.** El aislamiento no depende de una
  política bien escrita sino de una frontera física: la empresa A no
  comparte base con la B. Es la decisión de diseño más importante del
  sistema y la que hace que los hallazgos 1–3 sean "cerrar antes del
  segundo tenant" y no "cerrar hoy".
- **El token del catálogo público se valida en el servidor.** Las cinco
  RPCs que atienden a `anon` (21, 37, 38, 39 ×2) verifican el token
  antes de devolver o escribir nada.
- **La service key nunca tocó el frontend.** Está en secrets de Colab /
  GitHub Actions. La barrida de credenciales (regla R22, abajo) no
  encontró ninguna clave en el repositorio.
- **La VAPID privada sólo vive en la Edge Function.** El frontend tiene
  la pública nada más.
- **Idempotencia en la cola offline** (`27_IDEMPOTENCIA.sql`) y **doble
  chequeo en escrituras** (`validate.js`). No son "seguridad" en el
  sentido clásico, pero evitan la clase de bug que destruye confianza:
  el pedido duplicado.
- **`sourcemap: 'hidden'`** en Vite. Alguien decidió que la lógica de
  precios y márgenes no se leyera desde DevTools. Ese alguien estaba
  pensando en seguridad.

---

## 2 · Los hallazgos

### 🔴 1 · `USING (true)`: cualquier autenticado ve todo

```sql
-- sql/14_ADMIN_CONTROL.sql:53
create policy metas_select on public.metas for select to authenticated using (true);
```

Diecinueve políticas abiertas siguen vivas en la base. `28_RLS_ESTRICTO.sql`
las cierra **si se corrió**; los archivos viejos conservan su versión y el
guard (R11) las sigue listando:

```
cartera · stock · metas · focos · ejecutivos · prospectos
gerencia_clientes · zonas_comunas · ofertas_cliente · metas_zona
```

**El efecto con un solo tenant no es hipotético:** un ejecutivo ve la
cartera, las metas y los focos de sus pares. No es una fuga entre
empresas —todavía— pero sí es información que en una fuerza de ventas
se usa para compararse, y no tendría que estar disponible.

**Qué hacer:** correr `28_RLS_ESTRICTO.sql` y `35_RLS_CATALOGO.sql` (en
ese orden, con el pre-vuelo de `28` primero: si un usuario autenticado
no tiene fila en `ejecutivos`, al aplicarlo queda **bloqueado**), y
después marcar los archivos viejos como reemplazados.

---

### 🔴 2 · `SECURITY DEFINER` ejecutable por `anon`

**Corregido en V14.7** en `sql/01`, `sql/28` y `sql/42`.

Postgres concede `EXECUTE` a `PUBLIC` en **toda** función nueva. `PUBLIC`
incluye a `anon` — es decir, al visitante de un catálogo público que ni
siquiera inició sesión. Tres funciones que corren como owner quedaron
al alcance de cualquiera:

| Función | Qué hace | Riesgo |
|---|---|---|
| `renombrar_zona()` (42) | Escribe en 4 tablas | No escala: valida el rol adentro. Pero es superficie gratis. |
| `mi_rol()`, `soy_admin()`, `mi_tenant()`, `mi_ejecutivo_id()` (28) | Identidad | Devuelven el rol de quien llama; exponen el esquema. |
| `marcar_pedido_externo()` (01) | Actualiza `pedidos` | Estado de pedido, sin validar quién. |

**La corrección** es siempre el mismo par, y ahora es obligatorio:

```sql
REVOKE ALL ON FUNCTION public.mi_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_rol() TO authenticated;
```

---

### 🔴 3 · `SECURITY DEFINER` sin `SET search_path`

**Corregido en V14.7** en `sql/42_ZONAS_CONFIGURABLES.sql`.

```sql
-- ANTES · sql/42:151
CREATE OR REPLACE FUNCTION public.renombrar_zona(...) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER     -- ← corre como owner
AS $$                                  -- ← sin fijar search_path
```

Una función `SECURITY DEFINER` resuelve los nombres de objetos con el
`search_path` de **quien la llama**. Cualquier rol con permiso para crear
esquemas puede crear `public.cartera` en un esquema propio y hacer que la
función —que corre como owner— escriba ahí. Es **escalada de privilegios**,
el vector clásico de Postgres (CWE-426, documentado en CVE-2018-1058).

Una línea lo cierra: `SET search_path = public`.

---

### 🟠 4 · Los tokens del catálogo no vencen nunca

Un link `/catalogo/<token>` es una credencial: quien lo tiene, ve los
precios negociados de ese cliente y puede hacer pedidos en su nombre.
Hasta V14.7:

- No tenía fecha de vencimiento.
- La única forma de revocarlo era `activo = false`, que baja el catálogo
  entero — incluidas las ventas.

**Corregido en `sql/48_SEGURIDAD_CATALOGO.sql`:**

- `token_creado_en` · `token_expira_en` · `ultimo_acceso_en` en
  `ofertas_cliente`. Los existentes arrancan con 180 días.
- `catalogo_token_vigente(token)` — la validación en **un solo lugar**
  (hoy está copiada en cinco funciones).
- `rotar_token_catalogo(oferta_id)` — revocar un link sin bajar el
  catálogo. Sólo gerencia.

> ⚠️ **El vencimiento es decorativo hasta completar el paso 2.** Las
> funciones canónicas (21, 37, 38, 39) siguen validando sólo `activo`.
> El archivo trae el parche exacto, una línea por función. No se aplicó
> por sorpresa: ésas tienen dueño (regla 5 del proyecto) y el guard las
> marca con R8 si aparecen definidas en dos archivos.

---

### 🟠 5 · Pedidos públicos sin límite de velocidad

`crear_pedido_publico()` es un endpoint **anónimo que escribe**. Un
script con un token válido puede generar miles de pedidos y tapar el
inbox de bodega — el lugar donde un pedido perdido es plata perdida.

**Corregido en V14.7** con un trigger BEFORE INSERT (`48`): más de 20
pedidos del mismo `cliente_key` en 10 minutos se rechazan y quedan
registrados. Se resolvió con trigger y no tocando `21` por la regla de
"una función, un archivo".

---

### 🟠 6 · Sin auditoría de accesos

No existía la tabla. Ante un incidente no hay forma de responder "quién
vio qué y cuándo" — y la Ley 19.628 lo pide.

**Corregido en V14.7:** `seguridad_eventos` con RLS (sólo gerencia lee;
ni `anon` ni `authenticated` la consultan por tabla).

---

### 🟠 7 · La URL de producción hardcodeada como default

**Corregido en V14.7** en `scripts/KEYFOODS_CICLO_UNICO.py`:

```python
# ANTES
DEFAULT_URL = "https://<project-ref>.supabase.co"
url = (get_secret("SUPABASE_URL") or DEFAULT_URL)
if url inválida:  url = DEFAULT_URL      # ← caía en PRODUCCIÓN
```

Dos problemas: el identificador del proyecto quedaba versionado, y un
secret mal escrito hacía que el ciclo **cayera en silencio sobre la base
real** con la service key de otro entorno. Ahora falta el secret → el
ciclo se detiene. Fallar fuerte acá es infinitamente más barato que
reconstruir una cartera pisada.

> El project-ref sigue en el historial de git. No es un secreto por sí
> solo, pero anotalo si algún día se rota el proyecto.

---

### 🟡 8 · La autorización estaba escrita cuatro veces

```js
// App.jsx
esSuperAdmin: rol === 'superadmin' || rol === 'gerente' || rol === 'admin'
```

La misma comparación repetida en `App.jsx`, `Gerencia`, `Admin` y
`NavBar`. Cuatro copias son cuatro lugares donde una queda
desactualizada — y donde el resultado es "este vendedor ve el panel de
gerencia".

**Corregido en V14.7:** `lib/seguridad.js` con `esAdmin()`,
`puedeVerZona()` y `puedeOperarSobre()` como única definición. `App.jsx`
la consume. Normaliza mayúsculas y espacios: el ETL cargó roles como
`'GERENTE'` y compararlos sin normalizar daba falsos negativos.

---

### 🟡 9 · El token se mandaba al RPC tal cual venía de la URL

```js
// ANTES · CatalogoCliente.jsx
supabase.rpc('get_public_catalogo', { p_token: token })
```

`token` viene de `useParams()`: es **entrada del usuario**. La base
valida existencia, sí — pero no tiene por qué recibir un
`' or '1'='1` ni un `../../`.

**Corregido en V14.7:** `tokenCatalogoSeguro()` valida el formato antes
de la llamada, tanto al leer el catálogo como al enviar el pedido. La
nota del pedido pasa por `textoSeguro(nota, 500)`.

Defensa en profundidad: **la que decide sigue siendo la base.** Esto
evita el ruido y el abuso, no reemplaza la validación del servidor.

---

### 🟡 10 · Errores con la sesión completa en la consola

```js
console.error(`[data:${label}] ${info.dev}`, error)
```

Un error de Supabase incluye la configuración de la petición: URL del
proyecto y headers. En un teléfono con DevTools remoto es una credencial
a la vista.

**Corregido en V14.7:** `redactar()` en `lib/seguridad.js` enmascara
`password`, `token`, `access_token`, `Authorization`, claves de servicio
y cualquier JWT. `textoSeguro()` saca los caracteres de control: un
`\n` dentro de un dato cargado del ETL permite **falsificar líneas
enteras** del registro (log injection).

---

### 🟡 11 · `window.open` sin `noopener`

**Corregido en V14.7** en `PedidoSheet.jsx` y `lib/pedido.js`. Sin
`noopener`, el documento abierto recibe `window.opener` y puede navegar
**esta** pestaña a otra URL (reverse tabnabbing). En los `<a
target="_blank">` ya estaba el `rel` correcto; faltaban los
`window.open`.

---

### 🟡 12 · Sin cabeceras de seguridad

**Corregido en V14.7** en `apps/field/vercel.json` y
`apps/web/next.config.ts`: CSP, HSTS, `nosniff`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, COOP.

`Referrer-Policy: strict-origin-when-cross-origin` importa por algo
concreto: el link del catálogo lleva el token en la URL. Sin esa
cabecera, cualquier enlace saliente filtra el token completo en el
`Referer`.

> Si un tenant apunta a un dominio que no sea `*.supabase.co`, hay que
> agregarlo a `connect-src` en la CSP. Está anotado en el archivo.

---

### ⚪ 13 · Escapado HTML duplicado

`pedido.js` tenía su propio `escapeHtml` (sin cubrir la comilla simple)
junto al de `seguridad.js`. El contexto importa: ese HTML se abre como
`blob:` URL, que **hereda el origen de la app**. Un nombre de cliente
con `<script>` que venga de un Excel del ETL se ejecutaría con acceso al
localStorage — donde vive la sesión.

**Corregido en V14.7:** una sola implementación, en `seguridad.js`.

---

### ⚪ 14 · `zonas` y `zonas_comunas` legibles por `anon`

`sql/42:93` otorga lectura a `anon, authenticated` con `USING (TRUE)`.
Son datos de referencia (nombre y color de zona), no datos personales.
Se documenta y no se cambia: restringirlo sin relevar todo el catálogo
público es una decisión que necesita una prueba, no un parche.

---

## 3 · El modelo de acceso

| Rol | Ve | Escribe |
|---|---|---|
| `ejecutivo` | Su cartera, sus metas, sus focos, sus visitas | Sus check-ins, notas y pedidos |
| `gerente` / `admin` | Todo su tenant | Todo su tenant |
| `superadmin` | Todo su tenant | Todo su tenant |
| `anon` | Sólo catálogos publicados, por token | Pedidos públicos (con límite) |

Base: `ejecutivos.id = auth.uid()`.
Funciones de identidad `STABLE` (`mi_ejecutivo_id`, `mi_rol`,
`soy_admin`, `mi_tenant`) — se evalúan una vez por consulta, no por fila.

---

## 4 · Reglas de seguridad en el guard (R21–R24)

Siguen la misma idea que las once primeras: cada una existe porque el
problema ya estaba en el repo cuando se escribió. **Bloquean el CI.**

| Regla | Qué detecta | Qué encontró al nacer |
|---|---|---|
| **R21** | `SECURITY DEFINER` sin `SET search_path` | `renombrar_zona()` en `sql/42` |
| **R22** | Credencial escrita en el repositorio | la URL de producción del ETL |
| **R23** | `SECURITY DEFINER` sin `REVOKE ... FROM PUBLIC` | `sql/01`, `sql/28`, `sql/42` |
| **R24** | `_blank` sin `noopener` | 2 en `PedidoSheet`, 1 en `pedido.js` |

R22 escanea `sql/`, `scripts/` y los `src/` de ambas apps buscando JWT,
URIs con contraseña, project-refs de Supabase y service keys como
literal. Excluye tests y plantillas `.example`.

---

## 5 · Antes de aplicar RLS estricto

`28_RLS_ESTRICTO.sql` tiene un **pre-vuelo obligatorio**. El riesgo real:

> Si un usuario autenticado NO tiene fila en `ejecutivos`, al aplicar el
> RLS queda **bloqueado**: no ve nada y no puede trabajar.

El pre-vuelo lista esos usuarios y verifica que exista al menos un admin.
**Si devuelve filas, crear las filas faltantes antes de seguir.**

### Doble chequeo

1. ¿Queda alguna política abierta? → debe dar **cero filas**
2. ¿Alguna tabla sensible con RLS apagado?
3. **Aislamiento real** — simular un ejecutivo no-admin y comparar
4. ¿El catálogo público sigue funcionando para `anon`?
5. ¿El ETL sigue pudiendo escribir? (busca `FORCE ROW LEVEL SECURITY`)

### Rollback de emergencia

```sql
ALTER TABLE public.cartera DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock   DISABLE ROW LEVEL SECURITY;
```

Es un parche: deja los datos expuestos. Arreglar las filas de
`ejecutivos` y reactivar el mismo día.

---

## 6 · Pendiente

Ordenado por lo que hay que hacer antes de vender el segundo tenant.

- [ ] **🔴 Correr `28` + `35`** y marcar los archivos viejos como reemplazados
- [ ] **🔴 Aplicar el paso 2 de `48`** — que las 5 RPCs consulten
      `catalogo_token_vigente()`. Sin eso el vencimiento no rige.
- [ ] **🔴 Definir la política de sesión** — hoy no hay cierre por
      inactividad. `sesionExpirada()` ya cierra la sesión vencida; falta
      la decisión de negocio sobre el tiempo.
- [ ] **🟠 Rotar la service key** si alguna vez estuvo en un archivo versionado
- [ ] **🟠 Revisar `zonas` para `anon`** (hallazgo 14) con una prueba real
- [ ] **🟠 Rate limiting en el login** — hoy depende de Supabase
- [ ] **🟡 Consumir `redactar()` en `query.js`** — la función existe y está
      probada, pero los `console.error` no la llaman todavía
- [ ] **🟡 Consumir `puedeVerZona()` / `puedeOperarSobre()`** en las
      páginas que hoy comparan zonas a mano

---

## 7 · Lo que NO se encontró

Vale tanto como lo que sí, porque dice que la base está sana:

- **Ninguna credencial en el repositorio** (R22 corre limpio).
- **Ningún `dangerouslySetInnerHTML`** en la app. El único `innerHTML`
  fuera de React era la pantalla de arranque de `index.html`, y el texto
  que interpolaba ahora va por `textContent`.
- **La service key nunca llegó al frontend.**
- **Ningún SQL dinámico en el ETL** — no hay inyección posible por
  construcción.
- **`push_suscripciones` no tiene política de lectura.** Correcto: los
  endpoints de push son credenciales de envío y el acceso es sólo por
  RPC con la service key.
