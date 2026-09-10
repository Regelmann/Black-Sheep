# Evaluación de la propuesta de arquitectura

Revisión de la propuesta "Control Center como núcleo + adapters por
tenant" contra lo que ya está construido y probado.

---

## Lo que coincide, y ya está hecho

| Propuesta | Estado |
|---|---|
| Control Center primero, separado de Field | Hecho · `apps/control-center` |
| La data nunca se borra al cancelar | Hecho · suspender deja de devolver filas, no borra |
| Ciclo de vida del tenant con estados | Hecho · trial → activa → morosa → suspendida → cancelada |
| Separar Black Sheep / Tenant / Aplicaciones | Hecho · esquemas `platform` / `core` |
| Módulos habilitados por empresa | Hecho · `platform.capacidad`, 10 capacidades |
| SUPER_ADMIN / TENANT_ADMIN / TENANT_USER | Hecho, con más granularidad |
| Auditoría | Hecho · `platform.auditoria`, inmutable |
| Un usuario de un tenant jamás ve otro | Hecho · verificado en pruebas |
| `apps/` separadas por producto | Hecho · control-center, gerencia, field |

Se adopta además una idea buena que faltaba: el estado **archivada**,
para una empresa que se fue pero cuyos datos se conservan.

---

## Donde no estoy de acuerdo

### 1 · Una base de datos separada para el Control Center

**La propuesta:** una base propia de Black Sheep, y cada tenant con la
suya (Supabase de KeyFoods, PostgreSQL de Empresa A, API de Empresa B).

**El problema:** rompe el mecanismo de corte que hoy funciona.

Hoy, suspender una empresa la deja sin datos **en todas las tablas a la
vez**, porque el corte vive dentro de `platform.tiene_acceso()`, que es
la función por la que pasa toda política RLS. Está en la misma base que
los datos.

Si el control plane vive en otra base, ese chequeo pasa a ser una
pregunta que hace la aplicación:

```
Field  →  ¿Control Center, esta empresa está activa?  →  sí/no
```

Y ahí el interruptor deja de ser un interruptor. Una llamada directa a
PostgREST de la base del tenant nunca consulta al Control Center. Un job
de fondo tampoco. Se vuelve exactamente lo que evitamos: un chequeo en
la capa de aplicación que se esquiva recargando por otro camino.

Además: sin una sola base no hay llaves foráneas entre membresía y
datos, no hay transacción que cubra ambas, y aparecen N cadenas de
conexión que hay que guardar en algún lado — que es el problema de
dispersión de `service_role` que acabamos de cerrar.

**Lo correcto de la intuición, bien resuelto:** la separación tiene que
ser **lógica, no física**. Eso es exactamente lo que hacen los esquemas:

```
platform    tenants · usuarios · roles · planes · suscripciones · auditoría
core        datos de negocio de cada empresa
ingest      evidencia y linaje
compliance  privacidad
api         única superficie expuesta
```

Mismo motor, mismo límite de seguridad, cero cadenas de conexión que
administrar. Si algún día una empresa exige su propia base por contrato,
se le levanta una instancia completa: eso es aislamiento físico de
verdad, no un control plane remoto.

### 2 · El framework de adapters

**La propuesta:** cada tenant conserva sus tablas (`venta_consolidada`,
`salida_diaria`) y un adapter traduce.

**El problema:** es otro producto. Un adapter por cliente significa
**código nuevo por cada venta**. Es una plataforma de integración, no un
SaaS. Y trae consecuencias concretas:

- No hay read models compartidos: "cliente cayendo" se define una vez
  por adapter, y a los tres clientes significan tres cosas distintas.
- No hay RLS transversal: cada base con su propia configuración.
- El onboarding pasa de un día a un proyecto.

**Y el problema que el adapter resuelve ya está resuelto, mejor.** Cada
ERP nombra las cosas distinto: por eso existe el contrato de 4 archivos
y `ingest.mapeo_columna`. `RUT`, `COD CLIENTE` y `CODIGO_CLIENTE` son la
misma columna, y agregar un alias nuevo es un `INSERT`, no un
despliegue. Verificado: la maestra de la prueba entra con `RUT`, `CANAL`
y `RAZON SOCIAL`, que no son nombres canónicos, y el ciclo la normaliza
sola.

Ese contrato **es el activo comercial**. Es lo que permite decirle a una
distribuidora "mándame cuatro Excel y mañana estás operando". Un adapter
por cliente es lo contrario.

La propuesta dice, con razón, "no contaminamos el Core con las
particularidades de KeyFoods". De acuerdo. La forma de lograrlo no es un
adapter que preserve `venta_consolidada`: es el modelo canónico que ya
existe, al que KeyFoods entra por la misma puerta que cualquier otro.

### 3 · Field preguntándole al Control Center

**La propuesta:** Field consulta si el tenant existe, si está activo,
qué módulos tiene y qué adapter usa, y recién entonces carga.

Son cuatro viajes antes de pintar la primera pantalla, en un teléfono en
3G. Hoy los claims viajan **dentro del token** (hook de 027) y la RLS
hace cumplir el resto. Cero viajes, y no se puede saltar.

---

## Lo que sí adopto

1. **Estado `archivada`** en el ciclo de vida, con su comportamiento.
2. **El tenant demo con estructura deliberadamente distinta**, antes de
   vender. Es la mejor idea del documento: obliga a comprobar que
   construimos multitenancy y no "KeyFoods con otro nombre".
3. **`packages/` compartido.** Hoy `supabase.js`, `query.js` y
   `formato.js` están copiados en tres apps. Eso se va a desincronizar.

## La regla, corregida

La propuesta la cierra así, y es buena. Le cambio una frase:

> El Control Center administra la existencia, identidad, acceso,
> suscripción y configuración de los tenants. ~~Los adapters administran
> cómo cada tenant obtiene y transforma sus datos.~~ **El contrato de los
> cuatro archivos y el pipeline de ingesta administran cómo los datos de
> cualquier empresa entran al modelo canónico.** Las aplicaciones
> consumen ese modelo y no conocen las tablas internas de nadie.

Con esa corrección, lo que describe el documento **es lo que está
construido**, y el orden que propone es el que estamos siguiendo.
