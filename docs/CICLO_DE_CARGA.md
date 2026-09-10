# El ciclo de carga

Cómo una empresa actualiza sus datos **sola**, desde su dashboard, sin
que nadie de Black Sheep intervenga.

---

## El flujo

```
1  SUBIR      api.registrar_carga(tipo, nombre, sha256)  → lote_id
              api.agregar_filas(lote_id, filas)
                  · el archivo original queda guardado con su hash
                  · si ese hash ya se cargó, AVISA (no bloquea)

2  CICLO      api.ejecutar_ciclo(lote_id, venta_oficial)
                  · normaliza los nombres de columna
                  · valida obligatorias del contrato
                  · aplica elegibilidad y signo (D-05, D-06)
                  · reconcilia contra el total oficial
                  → lote queda VALIDADO. core NO se tocó todavía.

3  REVISAR    api.cargas · api.carga_exclusiones
                  · cuánto se calculó y cuánto difiere del oficial
                  · qué filas quedaron fuera y por qué

4  PUBLICAR   api.publicar_lote(lote_id, umbral, aprobar_caida)
                  · compuerta: rechaza si no cuadra
                  · RESPALDA lo que va a modificar
                  · aplica a core
                  → PUBLICADO

5  (si algo salió mal)
   REVERTIR   api.revertir_lote(lote_id)
```

**Un candado por empresa.** `pg_try_advisory_xact_lock` sobre el
`tenant_id`: dos personas de la misma empresa subiendo a la vez no se
pisan, y una empresa nunca bloquea a otra.

**El ciclo es reejecutable.** Borra lo derivado y recalcula desde la
fila cruda, que no se toca nunca. Si el resultado no convence, se
corrige la configuración (tipos de documento, alias de columnas) y se
vuelve a correr sin volver a subir el archivo.

---

## Los cuatro archivos NO se comportan igual

Esta es la decisión de diseño que evita el desastre.

| Archivo | Modo | Qué hace al publicar |
|---|---|---|
| **ventas** | **Incremental** | Acumula por `linea_id`. Volver a subir el mismo archivo no duplica; subir sólo el día suma al mes |
| **maestra** | Snapshot | Actualiza lo que trae y **desactiva** (no borra) lo ausente |
| **precios** | Snapshot + histórico | El precio de hoy se agrega; el de ayer se conserva con su fecha |
| **stock** | Snapshot | Reemplaza la cantidad vigente |
| **costos** | Snapshot + histórico | Igual que precios |

El modo lo determina el **tipo de archivo**, no una opción que el
usuario pueda equivocar. Tratar ventas como snapshot borra el
histórico; tratar la maestra como incremental deja clientes fantasma que
nadie da de baja.

---

## Por qué no se pisa la data

Cinco defensas, en orden:

**1 · La fila cruda es inmutable.** El archivo original y cada fila tal
como llegó quedan guardados. Nada se corrige ahí: se corrige el origen y
se vuelve a cargar.

**2 · `linea_id` hace la venta idempotente.**
`sha256(tenant|cliente|fecha|tipo_doc|documento|sku|monto)`, con
`ON CONFLICT DO NOTHING`. Probado en C4: el mismo archivo cargado dos
veces deja la venta en 1.060.000, no en 2.120.000.

**3 · Los snapshot desactivan, no borran.** Un cliente ausente de la
maestra queda `activo = false`. Su venta histórica sigue cuadrando.

**4 · Control de caída.** Si un archivo snapshot trae más de 30% menos
filas que lo vigente, la compuerta **no publica**: pide aprobación
explícita. Probado en C6: una maestra truncada con 1 de 3 clientes se
detiene y los tres clientes quedan intactos.

**5 · Respaldo antes de aplicar.** Cada publicación guarda en
`ingest.respaldo` una copia de las filas que va a modificar.
`api.revertir_lote()` deshace **esa** publicación sin tocar las demás.
Probado en C7: revertir la carga del día 6 devuelve la venta a
1.060.000 y deja intactas las cargas anteriores.

---

## La compuerta

`api.publicar_lote()` rechaza cuando:

| Situación | Resultado |
|---|---|
| El lote no está `validado` | RECHAZADO |
| No hay reconciliación | RECHAZADO |
| La venta difiere más del umbral (1% por defecto) del total oficial | RECHAZADO |
| Un snapshot trae >30% menos filas y nadie lo aprobó | REQUIERE_APROBACION |

**Nada de esto se puede saltar desde la interfaz**, porque no vive en la
interfaz.

---

## Columnas: el ERP de cada uno se llama distinto

`ingest.mapeo_columna` traduce. `RUT`, `COD CLIENTE`, `cliente_key` y
`CODIGO_CLIENTE` son la misma columna. La comparación ignora tildes,
espacios, puntos y mayúsculas.

- **Alias globales** (`tenant_id NULL`): los del contrato v3.
- **Alias propios** de una empresa: se agregan como fila y **ganan**.

Si mañana una distribuidora llama `ARTICULO` a su SKU, es un `INSERT`,
no un despliegue.

Una columna que el contrato no conoce se descarta en silencio: el
cliente puede agregar columnas propias sin romper nada. Lo que no puede
faltar son las obligatorias, y de eso se encarga la validación.

## Números y fechas

`"12.500"` en Chile son doce mil quinientos, no doce coma cinco. Leerlo
mal divide la venta por mil y el error pasa desapercibido, porque el
resultado sigue siendo un número válido.

| Entra | Sale |
|---|---|
| `12.500` · `$61.500` · `1.234.567` | 12500 · 61500 · 1234567 |
| `12.5` · `1,5` | 12.5 · 1.5 |
| `1.234.567,89` · `1,234,567.89` | 1234567.89 |

Fechas: `DD-MM-YYYY`, ISO, y el número serial de Excel (días desde
1899-12-30), que es lo que aparece cuando alguien pega una columna de
fechas sin formato.

---

## Quién lo hace

| Rol | Subir | Correr el ciclo | Publicar | Revertir |
|---|---|---|---|---|
| `tenant_admin` | sí | sí | sí | sí |
| `gerencia` | sí | sí | sí | sí |
| `ejecutivo` | no | no | no | no |
| `solo_lectura` | no | no | no | no |

**Ningún paso requiere superadmin.** Es el punto: con veinte empresas
contratadas, nadie de Black Sheep abre veinte veces el SQL Editor.

## Automatizarlo después

El ciclo es una función SQL, así que se puede disparar solo:

- **Trigger:** al cerrarse la carga, encolar `ejecutar_ciclo`. Publicar
  sigue siendo manual mientras la empresa se acostumbra.
- **`pg_cron`:** correr el ciclo de los lotes pendientes cada hora.
- **Auto-publicar:** una vez que una empresa lleva meses cuadrando sin
  intervención, se le puede permitir publicar automáticamente cuando la
  diferencia esté bajo el umbral. Es una capacidad más, apagada por
  defecto.

Primero manual y a la vista. La confianza en las cifras se gana
mostrando el trabajo, no escondiéndolo.
