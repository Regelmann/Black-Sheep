# Levantar Supabase · runbook

Una sola tarea, de principio a fin. No se pasa a lo siguiente hasta que
el paso 8 esté en verde.

Tiempo: entre una y tres horas, casi todo esperando.

---

## Antes de empezar

- [ ] Cuenta de Supabase
- [ ] Tu correo, el que va a ser superadmin
- [ ] El archivo `db/INSTALAR.sql` del repositorio

**No uses el proyecto Supabase de KeyFoods.** Este es nuevo y vacío. El
viejo sigue vivo con la 15.3 hasta que decidas apagarlo.

---

## 1 · Rotar la service_role vieja

Antes de nada, en el proyecto **viejo** de KeyFoods:
Settings → API → *Reset service_role key*.

Esa llave pasó por Colab, por Actions y por varios computadores. Rotarla
es gratis y corta cualquier copia que ande dando vueltas. Después hay
que actualizarla donde se use de verdad: GitHub Secrets y Colab.

- [ ] Rotada
- [ ] Actualizada en GitHub Secrets
- [ ] Actualizada en Colab

## 2 · Crear el proyecto

Supabase → New project.

| Campo | Valor |
|---|---|
| Name | `black-sheep-2` |
| Region | South America (São Paulo) |
| Database password | Genérala y **guárdala en tu gestor de contraseñas** |

São Paulo y no Virginia: cada consulta desde Santiago se ahorra unos
120 ms de ida y vuelta, y el vendedor en la calle lo nota.

- [ ] Creado
- [ ] Contraseña guardada

## 3 · Correr la instalación

SQL Editor → New query → pegar **todo** `db/INSTALAR.sql` → Run.

Son 5.053 líneas y tarda entre 10 y 40 segundos. No cierres la pestaña.

Al final se imprime una tabla con ocho filas. **Las ocho tienen que
decir OK.** Si alguna dice FALLA, no sigas: corrige y vuelve a correr el
archivo entero, que es idempotente.

- [ ] Corrió sin errores
- [ ] Ocho controles en OK

## 4 · Cerrar la superficie expuesta

Settings → API → **Exposed schemas**.

Tiene que quedar **sólo `api`**. Quita `public` y `graphql_public`.

Este paso es el que impide que una tabla nueva quede publicada a
internet por descuido. Si lo saltas, todo lo demás sigue funcionando y
por eso es fácil olvidarlo.

- [ ] Sólo `api` en la lista

## 5 · Tu cuenta

Authentication → Users → **Add user** → *Create new user*.
Tu correo y una contraseña.

Después, Authentication → Users → tu usuario → **Enable MFA**, o
configúralo al entrar por primera vez. Tu cuenta abre todas las
empresas; es la que más importa proteger.

- [ ] Usuario creado
- [ ] MFA activo

## 6 · El hook del token

Authentication → **Hooks** → *Customize Access Token (JWT) Claims* →
Enable → elegir `platform` → `custom_access_token_hook` → Save.

Sin esto **ningún token trae `tenant_id`**, la RLS niega todo y las
apps se ven vacías sin decir por qué. Es el paso que más confusión causa
si se omite.

- [ ] Hook habilitado y apuntando a `platform.custom_access_token_hook`

## 7 · Sembrarte como superadmin

SQL Editor:

```sql
INSERT INTO platform.superadmin (usuario_id, email)
SELECT id, email FROM auth.users WHERE email = 'tu@correo.cl';
```

Cambia el correo por el tuyo. Verifica:

```sql
SELECT s.email, u.created_at
  FROM platform.superadmin s
  JOIN platform.usuarios u ON u.id = s.usuario_id;
```

Si `platform.usuarios` sale vacía, el trigger de sincronización no
corrió porque el usuario se creó antes. Se arregla así:

```sql
INSERT INTO platform.usuarios (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

- [ ] Una fila en `platform.superadmin`
- [ ] Tu usuario en `platform.usuarios`

## 8 · Verificación final

```sql
-- 1 · Los ocho controles
SELECT control, estado FROM compliance.diagnostico();

-- 2 · Los cinco esquemas
SELECT nspname FROM pg_namespace
 WHERE nspname IN ('platform','core','ingest','compliance','api')
 ORDER BY 1;

-- 3 · Sin empresas todavía, y eso está bien
SELECT count(*) AS empresas FROM platform.tenants;

-- 4 · Sos superadmin
SELECT count(*) AS superadmins FROM platform.superadmin;
```

Esperado: ocho OK, cinco esquemas, cero empresas, un superadmin.

- [ ] Los cuatro resultados como se espera

---

## Terminado

Anota estos dos valores, que son los que van a necesitar las apps
(Settings → API):

```
Project URL     https://xxxxx.supabase.co
anon public     eyJ...
```

La `anon` es pública por diseño: lo que protege es la RLS. La
`service_role` **no se copia a ningún lado** por ahora.

**Acá se detiene esta tarea.** El siguiente paso es dar de alta KeyFoods
desde el Control Center, y eso necesita las apps desplegadas. Es otro
runbook.

## Si algo sale mal

| Síntoma | Causa casi segura |
|---|---|
| Un control en FALLA tras el paso 3 | El archivo se pegó cortado. Volver a pegarlo entero |
| `permission denied for schema api` | Falta el paso 4 |
| La app entra pero no muestra nada | Falta el paso 6, o el usuario no tiene membresía |
| `relation "platform.superadmin" does not exist` | El paso 3 no llegó al final |
