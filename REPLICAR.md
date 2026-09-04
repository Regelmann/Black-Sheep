# Replicar a otra empresa — estado real

## ✅ Lo que YA funciona

**URL por empresa.** `app.black-sheep.cl/{empresa}/dashboard` y
`/{empresa}/datos`. Si se entra por `/dashboard` a secas, se reescribe a la
URL con empresa — así el link es compartible y cada cliente tiene el suyo.

**Carga de los 4 archivos.** `domain/CargaArchivos.jsx` acepta
`precios · stock · maestra · ventas` desde `/{empresa}/datos`.

**Aislamiento por tenant.** `lib/tenants.js` resuelve la empresa desde la
URL, el email o lo guardado. `applyTenantBrand()` aplica el color.

### 🔴 Lo que arreglé acá

**El dashboard no era alcanzable desde el teléfono.** Estaba construido,
con ruta y con la carga de archivos, pero **ningún botón llevaba ahí** —
sólo se llegaba escribiendo la URL a mano.

Es el cuarto caso del mismo patrón: `GoalCard` con un import roto dos meses,
el Control Center apuntando a la web de marketing, `Ventas.jsx` sin ruta, y
ahora esto. **Construir sin cablear.**

Agregado al menú "más" del nav inferior: **Dashboard** y **Cargar datos**.

---

## 🔴 Lo que FALTA para vender la segunda instancia

### 1 · Las políticas RLS abiertas

```
[R11] sql/08, 13, 14, 15, 17, 19, 20 — using(true)
```

**19 políticas con `using(true)`.** Hoy no molestan porque hay un solo
tenant. Con dos, **una empresa puede ver los datos de la otra.**

Esto no es un detalle de UI: es el bloqueante real de la replicación. Sin
cerrarlo, no se puede vender una segunda instancia.

`28_RLS_ESTRICTO.sql` cerró las principales; estos archivos viejos quedaron.

### 2 · Los SQL sin correr

```
41_VENTAS_LINEAS.sql          ← el incremental
40_STOCK_COLUMNAS_CICLO.sql   ← decision_comercial
26_CATALOGO_ORDEN.sql         ← el catálogo completo
```

**El catálogo va a seguir mostrando 2 productos hasta que corras el 26.**
El límite está en la función de la base, no en el código.

### 3 · El ciclo ETL sigue siendo manual

Corre en Colab. Para una demo replicable tiene que correr solo: el archivo
de GitHub Actions existe, faltan cinco secretos.

---

## Lo que pediste y NO está en esta versión

Tu lista de correcciones visuales —Hoy, Visita, Clientes, Stock, Gerencia,
catálogo— es **una versión por pantalla**, no una entrega.

Prefiero decírtelo antes que entregarte seis pantallas a medias. Mandame una
por vez con la captura y la cierro completa, como hicimos con el mapa.

**Mi orden sugerido**, por impacto:

1. **RLS** — sin esto no se puede vender a un segundo cliente
2. **Los 3 SQL** — desbloquean el catálogo y el incremental
3. **Hoy** — es la pantalla que el vendedor abre todos los días
4. **Visita** — donde se rompe el flujo de trabajo
5. El resto

Pero decidís vos: si preferís cerrar lo visual primero para poder mostrarlo,
lo hago en ese orden.
