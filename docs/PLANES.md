# Planes y capacidades

Cómo se empaqueta lo que se vende.

---

## Tres niveles, no dos

```
PLAN          el paquete comercial · lo que se cotiza
CAPACIDAD     la unidad técnica · lo que enciende una sección
EXCEPCIÓN     lo que se le vendió o quitó a UNA empresa en particular
```

El plan agrupa capacidades. La empresa contrata un plan. Y si a alguien
se le vende un módulo suelto sin subirlo de plan, eso es una excepción.

## Orden de resolución

```
1 · Excepción del tenant   →  manda
2 · Lo que trae su plan
3 · Apagada
```

**Ojo con el 3.** Si una capacidad no está en el plan y no hay
excepción, queda apagada. Antes el respaldo era "activa por defecto", y
eso significaba regalar módulos sin haberlo decidido.

## Los dos planes iniciales

| | Terreno | Completo |
|---|---|---|
| Cartera, ruta y pedidos | ✓ | ✓ |
| Check-in con GPS | ✓ | ✓ |
| Catálogo para el cliente | ✓ | ✓ |
| Stock | ✓ | ✓ |
| Metas por ejecutivo | ✓ | ✓ |
| Venta por producto | ✓ | ✓ |
| Focos del mes | | ✓ |
| Margen y ventas bajo costo | | ✓ |
| Prospectos | | ✓ |
| Encuestas en visita | | ✓ |

**Este empaquetado es una decisión comercial, no técnica.** Son un punto
de partida razonable, no una verdad. Cambiar qué incluye cada plan es un
`INSERT` o un `DELETE` en `platform.plan_capacidad`, no un despliegue.

El criterio que usé: Terreno es lo que necesita un vendedor para
trabajar en la calle; Completo agrega lo que mira gerencia sentada.
Si tu criterio comercial es otro, se cambia en un minuto.

## El precio

`platform.plan.precio_mensual` es la **referencia**. Lo que se le cobra
a cada empresa vive en `platform.suscripcion.monto_mensual`.

Están separados a propósito: un cliente antiguo puede quedarse con el
precio viejo cuando subas la lista, y eso es una decisión comercial, no
un error de datos. Cambiar el precio del plan **no toca** lo que ya se
le cobra a nadie.

## Cambiar de plan

`api.admin_cambiar_plan(tenant, plan, limpiar_excepciones)`

Las excepciones **sobreviven** al cambio salvo que pidas limpiarlas. Si
a alguien le vendiste un módulo suelto, subirlo de plan no puede
quitárselo por sorpresa.

## Qué pasó con las empresas que ya existían

La migración mueve al plan Terreno cualquier empresa cuyo plan no esté
en el catálogo, y lo anota en su suscripción. Sin eso, una empresa con
plan `base` se quedaba de golpe sin ninguna capacidad: la app le seguía
abriendo pero vacía, y nadie iba a entender por qué.

## Vender un módulo suelto

En la ficha de la empresa, en el Control Center, prendes la casilla. Eso
crea una excepción y queda registrado en la auditoría. Para cobrarlo,
ajustas el `monto_mensual` de su suscripción.

Si un módulo se vende suelto muchas veces, es señal de que el
empaquetado está mal y conviene mover esa capacidad al plan.
