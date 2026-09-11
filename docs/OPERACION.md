# Operación · todo en un lugar

Qué está hecho, qué falta y el paso exacto de cada cosa. Sin adivinar.

---

## 1 · Estado

| Pieza | Estado |
|---|---|
| Repositorio en GitHub, `main` = 2.0 | ✅ |
| V15.3 congelada en `v15.3-congelada` | ✅ |
| CI en verde con 4 trabajos | ✅ |
| Protección de rama con checks obligatorios | ✅ |
| Proyecto Supabase `black-sheep-2` | ✅ |
| 34 migraciones aplicadas · 8/8 controles | ⚠️ hay que volver a correr `INSTALAR.sql` |
| Esquemas expuestos: sólo `api` | ✅ |
| Hook del token | ✅ |
| Superadmin sembrado | ✅ |
| KeyFoods creada, plan Completo | ✅ |
| Tipos de documento de KeyFoods | ⚠️ están los de ejemplo, faltan los reales |
| Edge Function de usuarios desplegada | ❌ |
| Vercel: gerencia | ⚠️ falta Install Command |
| Vercel: control-center, field, catalogo | ❌ |
| `service_role` vieja de KeyFoods rotada | ❌ |

---

## 2 · Supabase · lo que falta

### 2.1 · Volver a correr el instalador

SQL Editor → New query → pegar todo `db/INSTALAR.sql` → Run.

Es idempotente: se puede pegar entero cuantas veces haga falta. Al final
imprime los ocho controles; **los ocho tienen que decir OK**.

Hay que rehacerlo cada vez que el repositorio suma migraciones. Hoy son 34.

### 2.2 · Desplegar el Edge Function de usuarios

Sin esto, el botón "Crear cuenta" del Control Center no funciona y
KeyFoods no puede tener vendedores.

```bash
npx supabase login
npx supabase link --project-ref TU_REF
npx supabase functions deploy admin-usuarios
```

`TU_REF` es el código de la URL de tu proyecto: en
`https://abcdefgh.supabase.co` el ref es `abcdefgh`.

**No hay que darle la `service_role`:** Supabase la inyecta sola en sus
Edge Functions. Por eso preferimos esta vía antes que una función en
Vercel, donde habría que copiar la llave a mano.

### 2.3 · Rotar la llave vieja de KeyFoods

En el proyecto **viejo** (el de KeyFoods, no el nuevo):
Settings → API → Reset service_role key.

Esa llave pasó por Colab, por GitHub Actions y por varios computadores.
Después hay que actualizarla donde se use de verdad: GitHub Secrets y
Colab.

---

## 3 · Vercel · cinco proyectos

Cuatro apps de la 2.0 más la landing. **Todos bajo tu cuenta de Gmail**,
no bajo la de KeyFoods.

### 3.1 · Configuración de cada uno

Vercel → Add New → Project → repositorio `Black-Sheep`.

| Proyecto | Root Directory | Framework |
|---|---|---|
| `control-center` | `apps/control-center` | Vite |
| `gerencia` | `apps/gerencia` | Vite |
| `field` | `apps/field` | Vite |
| `catalogo` | `apps/catalogo` | Vite |
| `web` | `apps/web` | Next.js |

Para **las cuatro de Vite** (no para `web`):

**Settings → Build and Deployment**

```
Build Command      npm run build
Output Directory   dist
Install Command    cd ../.. && npm install
Root Directory     apps/<la que corresponda>
```

Dos cosas que van juntas y que, si falta una, rompen el build:

**a) Include files outside the root directory in the Build Step** tiene
que estar ACTIVADO (Settings → Build and Deployment). Si está apagado,
Vercel sube sólo `apps/<x>` y la raíz del repositorio no existe para el
build: el error es `ENOENT ... /vercel/path0/package.json`.

**b) Install Command** `cd ../.. && npm install`. Es un monorepo con
workspaces: si cada app instala sólo lo suyo, los paquetes compartidos
de `packages/` no encuentran sus dependencias.

Si el Install Command falla con ENOENT, el problema es (a), no (b): la
raíz no está ahí para instalarla.

**Settings → Environment Variables** · las mismas dos en los cuatro,
marcando Production, Preview y Development:

```
VITE_SUPABASE_URL        Supabase → Settings → API → Project URL
VITE_SUPABASE_ANON_KEY   Supabase → Settings → API → anon public
```

La `anon` es pública por diseño: lo que protege es la RLS. **La
`service_role` no va en Vercel.** Si aparece, el CI rompe el build.

`web` es Next.js y queda fuera del workspace a propósito: tiene su
propio lockfile. No le cambies el Install Command.

### 3.2 · Dominios

| Proyecto | Dominio |
|---|---|
| `web` | `black-sheep.cl` y `www.black-sheep.cl` |
| `control-center` | `admin.black-sheep.cl` |
| `gerencia` | `*.app.black-sheep.cl` (comodín) |
| `field` | `*.terreno.black-sheep.cl` (comodín) |
| `catalogo` | `pedido.black-sheep.cl` |

Los comodines requieren que el DNS del dominio esté administrado por
Vercel, o un registro `CNAME *` apuntando a `cname.vercel-dns.com`.

Mientras no configures dominios, las URLs `.vercel.app` funcionan igual.

---

## 4 · Poner a KeyFoods a operar

En este orden. Cada paso depende del anterior.

**1 · Tipos de documento reales.** Control Center → KeyFoods → Tipos de
documento. Hoy están los de ejemplo (FA, BE, NC, GD). Abre su Excel de
ventas, mira los valores distintos de la columna de tipo y decide uno
por uno: suma, resta o no cuenta.

**Sin esto la venta queda en cero.** Media hora mirando datos reales.

**2 · Usuarios.** Control Center → KeyFoods → Usuarios → Crear cuenta.
La contraseña se genera sola y se muestra **una vez**: entrégasela por
un canal seguro. Requiere el paso 2.2.

**3 · Primera carga.** Que entren a `gerencia` → Cargar datos, en este
orden: precios, stock, maestra, ventas.

El de ventas con **histórico completo**: doce meses es lo ideal, tres el
mínimo. Si suben sólo el día de hoy, todos los clientes salen como
nuevos y sin promedio.

**4 · Cuadrar.** Al cargar ventas, declarar la venta neta oficial del
período. La compuerta rechaza si difiere más del 1%. Si rechaza, es
porque algo no cuadra: se revisa antes de publicar, no después.

**5 · Revisar integridad.** Gerencia → Resumen. Ahí aparecen clientes
sin comuna, SKU con stock y sin precio, ventas de clientes que no están
en la maestra. Son cosas que ya existen en sus datos; la app las hace
visibles.

---

## 5 · El ciclo de trabajo de ahora en adelante

```bash
git checkout main && git pull
# descomprimir el parche encima
cp -r /tmp/p/. .
npm install                      # en la RAÍZ
git checkout -b <nombre-corto>
git add -A && git status --short
git commit -m "..."
git push -u origin <nombre-corto>
```

Después en GitHub: abrir el PR, esperar los cuatro checks, mergear.
Y de vuelta `git checkout main && git pull`.

Si el parche trae migraciones, volver a correr `INSTALAR.sql`.
Si trae cambios de front, Vercel redespliega solo al mergear. **Ctrl+Shift+R**
al revisar, o ves la versión cacheada.

---

## 5.bis · Desplegar el Edge Function de usuarios

Se hace **una vez**. Después sólo se repite si cambia
`supabase/functions/admin-usuarios/index.ts`.

```bash
# 1 · Instalar y entrar (abre el navegador, autoriza y vuelve)
npx supabase login

# 2 · Vincular el repositorio con tu proyecto
#     El ref sale de la URL: en https://abcdefgh.supabase.co es "abcdefgh"
npx supabase link --project-ref TU_REF
#     Va a pedir la contraseña de la base de datos, la que guardaste al crearla

# 3 · Desplegar
npx supabase functions deploy admin-usuarios
```

**Verificación:** Supabase → Edge Functions. Tiene que aparecer
`admin-usuarios` como Deployed. Después, en el Control Center, crear un
usuario de prueba en KeyFoods: si devuelve una contraseña, funcionó.

No hay que darle la `service_role`: Supabase la inyecta sola en sus Edge
Functions. Por eso esta vía y no una función en Vercel, donde habría que
copiar la llave a mano.

---

## 6 · Cada vez que cambia algo

Este es el orden, siempre. Lo que no aplique se salta, pero el orden no
cambia.

| Si el cambio toca… | Hay que… |
|---|---|
| `db/migrations/` | Correr `db/INSTALAR.sql` completo en el SQL Editor |
| `supabase/functions/` | `npx supabase functions deploy <nombre>` |
| `apps/` o `packages/` | Nada: Vercel redespliega solo al mergear |
| Variables de entorno | Cambiarlas en Vercel **y** redesplegar a mano |
| `.github/workflows/` | Nada: corre solo en el próximo push |

Y siempre, en este orden:

```bash
git checkout main && git pull
# aplicar el parche
npm install                      # en la RAÍZ
git checkout -b <nombre-corto>
git add -A && git status --short
git commit -m "..."
git push -u origin <nombre-corto>
```

PR → cuatro checks en verde → merge → `git checkout main && git pull`.

Al revisar en el navegador: **Ctrl+Shift+R**. Sin eso ves la versión
cacheada y crees que no funcionó.

---

## 7 · Lo que sigue pendiente en el producto

| | Qué |
|---|---|
| Alto | Botón "Enviar catálogo" en la pantalla del cliente en terreno |
| Alto | Probar la cola offline en un teléfono real, sin señal, 20 ciclos |
| Medio | Mapa y Más en terreno · service worker |
| Medio | Paginación en cartera y cargas, con datos reales |
| Medio | Observabilidad: hoy un error en producción no avisa a nadie |
| Bajo | Mercado Pago · proyecto aparte, después del primer cobro real |

Los dos primeros vienen del informe de la V15.x y siguen siendo válidos
para la 2.0: la prueba offline en un teléfono real es la que decide si
el vendedor usa la app o vuelve al cuaderno.
