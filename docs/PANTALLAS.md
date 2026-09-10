# Pantallas · qué lee cada una

Cada pantalla lee **una** vista de `api`, con columnas declaradas. Nunca
una tabla cruda, nunca `select('*')`. Esto es lo que baja `Gerencia.jsx`
de 2.360 líneas: los cálculos ya vienen hechos.

El cliente de datos se conserva de la 15.3 tal cual: `safeSelect` +
`useDatos`. Lo único que cambia es a dónde apuntan.

---

## Hoy · el plan del día

`api.mi_dia` · `api.llamar_hoy` · `api.cartera`

| Bloque | Fuente | Regla |
|---|---|---|
| Mi venta MTD | `mi_dia.venta_mtd` | Neta, con las NC ya restadas |
| Avance a meta | `mi_dia.avance_pct` | Nulo si no hay meta cargada, nunca 0% |
| Clientes activos | `mi_dia.clientes_activos` | Compró en los últimos 30 días |
| Brecha de cartera | `mi_dia.brecha_cartera` | Suma de brechas negativas |
| Llamar hoy | `llamar_hoy` | Enfriándose, en riesgo o dormido, ordenados por promedio 3M |
| Mi cartera cayendo | `cartera` con `brecha < 0` | |
| Nuevos y recuperados | `cartera` con `estado='activo'` y primera compra del mes | |

Un cliente bloqueado nunca aparece como oportunidad de venta.

## Ruta · el mapa

`api.ruta_dia`

Sólo clientes con coordenadas. Los que no las tienen **no se esconden**:
salen en `api.integridad` como `CLIENTE_SIN_UBICACION` para que alguien
los corrija. Ocultar un cliente sin avisar es cómo se pierde una cartera.

Los pines usan **hex literal**, nunca `var(--x)`: un `data:image/svg+xml`
no resuelve variables CSS y el pin sale negro siempre.

## Clientes · la cartera

`api.cartera`

Estados, en un solo lugar (`core.estado_cliente`):

| Estado | Días sin comprar |
|---|---|
| activo | ≤ 30 |
| enfriándose | 31–60 |
| en riesgo | 61–90 |
| dormido | 91–180 |
| fugado | > 180 |
| nunca compró | sin ventas |
| bloqueado | marca de la maestra |

Los datos de contacto vienen de `core.cliente_contacto` y requieren
permiso `ver_contacto`. Un rol sin ese permiso ve la cartera completa y
cero teléfonos: comprobado en la prueba 7.

## Stock

`api.stock_vendible`

`es_vendible` = tiene precio **y** stock > 0. Un SKU con stock y sin
precio se muestra con `SIN_PRECIO_LISTA`, no se oculta: es justamente lo
que hay que ir a corregir.

## Catálogo del cliente

`api.get_catalogo(token)` · `api.crear_pedido_publico(...)`

Sin sesión. El token se valida por hash, expira, se revoca y tiene límite
de intentos. Sólo devuelve los productos publicados para ese cliente: no
sirve para llegar a nada más.

El precio se recalcula **siempre** en el servidor. Lo que manda el
cliente es una intención, no un dato.

## Gerencia

`api.gerencia_zona` · `api.gerencia_ejecutivo` · `api.gerencia_producto` · `api.integridad`

| Métrica | Corrección respecto de la 15.3 |
|---|---|
| Venta MTD | Las NC restan |
| Mix % | Denominador = venta del mes, no de la línea |
| Margen | `NULL` si no hay costo. Nunca 0 |
| Cobertura | activos / total de la cartera |

**Panel de integridad**, el que responde "¿por qué no aparece este
cliente?": zona y comuna contradictorias, clientes sin ubicación, SKU con
stock y sin precio, ventas de clientes que no están en la maestra, zonas
sin ventas.

## Admin

Zonas, comunas, metas, focos, usuarios, tipos de documento, cargas.
Toda escritura deja auditoría en `platform.auditoria`, que no se edita ni
se borra: no hay política de UPDATE ni DELETE, así que la RLS los
rechaza. Una bitácora modificable no es una bitácora.

---

## Cadencias

| Cuándo | Qué | Dónde |
|---|---|---|
| Cada carga | Ingesta → reconciliación → compuerta → publicación | `ingest` |
| Diaria | Recalcular ofertas por cliente, registrando la versión de la regla | `core.oferta_cliente` |
| Diaria | Armar la ruta del día | `core.visita` |
| Semanal | Revisión de oportunidades con el equipo | `api.integridad` + gerencia |
| Mensual | Metas y focos del mes | `core.meta`, `core.foco` |
| Mensual | Retención en modo prueba, revisar, después aplicar | `compliance.aplicar_retencion()` |
| Continua | Diagnóstico después de cada despliegue | `compliance.diagnostico()` |
