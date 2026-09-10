# Subir la 2.0 a GitHub

---

## La decisión antes de tocar nada

En el repositorio actual vive la **V15.3**, que está en producción como
apoyo de KeyFoods. La 2.0 es un árbol nuevo: mismos nombres de carpeta,
código distinto. Si se mezclan, `apps/field` de la 15.3 y `apps/field`
de la 2.0 chocan y queda un Frankenstein.

**Lo que recomiendo: un repositorio, una rama, y la 15.3 preservada en
una etiqueta.**

- Una etiqueta conserva la 15.3 completa y recuperable para siempre.
- `main` pasa a ser la 2.0, que es donde va a ocurrir todo.
- Si algún día hace falta un hotfix de la 15.3, se saca una rama desde
  la etiqueta, se arregla y se vuelve a etiquetar. No antes.

No dos repositorios: son dos lugares donde buscar, y a la tercera semana
alguien edita el equivocado.

## Los comandos

Desde la carpeta del repositorio, en Git Bash:

```bash
# 1 · Asegurarse de estar al día y sin cambios sueltos
git status
git pull

# 2 · Congelar la 15.3 con una etiqueta
git tag -a v15.3-congelada -m "V15.3 en produccion como apoyo de KeyFoods"
git push origin v15.3-congelada
```

Verifica en GitHub que la etiqueta esté antes de seguir. Es tu red.

```bash
# 3 · Vaciar el árbol de trabajo (los archivos viejos siguen en la etiqueta)
git rm -r --cached .
find . -maxdepth 1 ! -name '.' ! -name '.git' -exec rm -rf {} +

# 4 · Copiar acá el contenido del zip de la 2.0
#     (la carpeta bs2/ del zip va al RAÍZ del repositorio, no dentro)

# 5 · Commit
git add .
git commit -m "App 2.0: base multi-tenant, motor de carga, tres apps

- 31 migraciones idempotentes, 8/8 controles de seguridad
- Contrato de 4 archivos y ciclo de carga con compuerta y reversion
- Control Center, dashboard de gerencia y app de terreno
- Precio por cliente: acordado, historico y lista
- Segundo tenant de prueba con estructura distinta

La V15.3 queda en la etiqueta v15.3-congelada."

git push origin main
```

## Qué pasa al pushear

Se dispara **Verificar** (`.github/workflows/verificar.yml`), que hace
lo mismo que se hace a mano:

| Trabajo | Qué comprueba |
|---|---|
| Migraciones y pruebas | Las 31 migraciones corren dos veces (idempotencia) y las 5 suites pasan |
| Guard y build | Las tres apps compilan y ninguna viola las reglas del guard |
| Sin credenciales | Ningún JWT ni `service_role` literal en el repositorio |

Si algo se pone rojo, **no se despliega**. Es la red que evita que un
cambio de una tarde rompa el aislamiento entre empresas sin que nadie se
entere hasta que un cliente ve datos de otro.

## Antes del primer despliegue

Los secretos van en GitHub → Settings → Secrets, nunca en el código:

```
SUPABASE_URL
SUPABASE_SERVICE_KEY     ← rotarla primero (ver AUDITORIA_SEGURIDAD.md)
```

Y en Vercel, una variable por app, sólo con la anon key:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Si prefieres no tocar `main` todavía

Alternativa conservadora: subir la 2.0 a una rama y mirarla antes de
cambiar `main`.

```bash
git checkout -b app-2.0
# copiar los archivos, git add, git commit
git push -u origin app-2.0
```

El CI corre igual sobre el pull request. Cuando estés conforme, se
fusiona a `main` y ahí sí se etiqueta la 15.3.
