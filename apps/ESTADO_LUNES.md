# Estado para el lunes — v-BS-PLATFORM-V11.6

**528/528 tests · ESLint 0 · typecheck ✅ · guard ✅ · build ✓**

---

## 1 · Qué entra en esta versión

### Push notifications al cliente final

El cliente abre el catálogo por link **sin sesión** y puede suscribirse a
avisos. Bien resuelto en lo que importa:

- La clave privada VAPID vive **sólo** en la Edge Function, nunca en el bundle
- La tabla de suscripciones tiene **cero políticas RLS**: acceso exclusivo por
  RPC `SECURITY DEFINER`. `anon` puede insertar la suya y nada más
- Sin HTTPS, sin service worker o sin clave VAPID, `pushDisponible()` devuelve
  `false` y el botón ni aparece

### Portal de pedidos por token

El cliente ve el historial de **sus** pedidos desde el mismo link del catálogo.

### 🔴 Tres bugs reales encontrados al integrar

**El SW tenía DOS handlers `fetch`.** En un Service Worker sólo se puede
llamar `respondWith` una vez por evento: el segundo handler —el de navegación
"red primero" que escribí en V10.4— **quedaba anulado**. La estrategia nunca
gobernó.

**El SW perdió la exclusión de Supabase.** El archivo llegó con el comentario
pero sin la lógica, y con una variable `url` que nunca se declaraba. Sin eso
el SW cachea respuestas de la API: datos de ayer, o de otro tenant.

**Dos bugs en SQL que escribí yo:**

- `21_PEDIDO_PUBLICO`: no guardaba `token_catalogo` → el cliente no podía ver
  su propio historial
- `26_CATALOGO_ORDEN`: sin fallback a `stock.precio_unidad`, un producto sin
  `precio_lista` salía en **$0**

### Escritorio

En pantalla ancha la app quedaba como una columna angosta con la barra
inferior tapando contenido. Ahora se centra en 560px con fondo propio.

**No la convertí en un layout de escritorio**: es una PWA de terreno y el
diseño de una mano es el correcto. Sólo se ve bien cuando la mostrás en una
pantalla grande.

---

## 2 · `apps/web` — el sitio de black-sheep.cl

**Next.js 15 + Tailwind + framer-motion.** 30 componentes: ROI calculator,
comparación, casos, FAQ, formulario de demo.

**Funciona sin base de datos.** `api/leads` importa Postgres sólo si existe
`DATABASE_URL`; sin esa variable el lead queda en logs de Vercel y el
formulario confirma igual. **Para el lunes no hay que configurar nada.**

### Deploy — proyecto NUEVO en Vercel

| | |
|---|---|
| Root Directory | `apps/web` |
| Framework | Next.js (autodetectado) |
| Dominio | `black-sheep.cl` |

El PWA sigue en `app.black-sheep.cl` sin tocarse. Son dos proyectos
independientes: uno es Vite, el otro Next. Compartir dependencias traería
conflictos de versión de React sin ganar nada.

**Cuando quieras persistir los leads**, apuntá `DATABASE_URL` a la **misma
Postgres de Supabase** que ya usás. No levantes una segunda base.

---

## 3 · ¿Se puede replicar a otra empresa?

**Técnicamente sí. Operativamente todavía no.**

### Lo que ya es replicable

| | |
|---|---|
| Multi-tenant | `tenants.js` + `applyTenantBrand()` |
| Aislamiento | RLS por ejecutivo y por tenant (`28_RLS_ESTRICTO`) |
| Marca por cliente | Color, logo y nombre por configuración |
| Offline | IndexedDB con backoff, idempotencia y bandeja de fallidos |
| Carga de datos | Importador CSV con validación y previsualización |

### Lo que falta para un segundo tenant

**1 · El importador no está cableado.** `catalogControlCenter.js` tiene la
lógica de diff/validación/plan con tests, pero **ninguna pantalla lo usa**.
Sin eso, cargar los datos de una empresa nueva sigue siendo trabajo manual
tuyo.

Lo vengo marcando desde V11.4. Es lo que más separa "producto replicable" de
"proyecto a medida".

**2 · Falta el checklist de alta de tenant.** Hoy el conocimiento de qué
configurar está en tu cabeza y en esta conversación, no en un documento.

**3 · Los datos de KeyFoods no están del todo sanos.** Sigue pendiente correr
`32_CONTRADICCION_ZONA_COMUNA.sql` y `34_POR_QUE_FALTAN_PROSPECTOS.sql`. Si
esos números son altos, el segundo cliente arrancaría con el mismo problema.

**Mi respuesta honesta:** para *demostrar* a otra empresa, estás listo. Para
*onboardearla sin que vos cargues los datos a mano*, faltan esas tres cosas —
y la primera es un día de trabajo.

---

## 4 · Para el lunes, en orden

### Hoy

1. **Desplegar V11.6** (comandos abajo)
2. **Correr en Supabase, en orden:** `37` → `38` → `39`
3. **Correr los diagnósticos:** `32` y `34`. Los números que devuelvan
   deciden si hay que limpiar datos antes de mostrar

### Antes de presentar

4. **Probar en el teléfono el recorrido completo:**
   Hoy → Mapa (mirá "Dónde ir ahora") → tocar un cliente → Check-in →
   Catálogo → enviar pedido
5. **Modo avión** en Clientes: tenés que ver tu cartera con el aviso naranja
   de copia guardada
6. **Desplegar `apps/marketing`** como proyecto nuevo apuntando a
   `black-sheep.cl`

### Lo que NO haría antes del lunes

Cablear el Control Center o rediseñar pantallas. Faltan dos días: lo que
importa es que lo que ya existe funcione sin sorpresas delante de alguien.

---

## 5 · Sobre `Texto.txt`

Estoy de acuerdo con el orden que propone:

> Lo más importante ahora no es agregar Media ni más pantallas: es blindar el
> dato que alimenta precio, stock, catálogo y recomendaciones.

Es exactamente el argumento del punto 3.3: si entra un precio incorrecto,
todo lo que construyamos encima puede verse espectacular y seguir tomando
malas decisiones.

**Después del lunes**, ese sería el trabajo: DATA GATE primero, features
después.
