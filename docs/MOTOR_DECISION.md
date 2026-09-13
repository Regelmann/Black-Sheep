# El motor de decisión

Lo que convierte una lista de clientes en un plan de trabajo.

---

## Qué problema resuelve

Sin motor, la app le muestra al vendedor su cartera ordenada por venta y
él decide a quién visitar. Eso ya lo hacía con un cuaderno.

El motor responde otra pregunta: **a quién hay que ir hoy, por qué, y
qué decirle.**

## La decisión no es una alerta

Una alerta dice «12 clientes cayendo». Una decisión dice:

```
Hotel Bidasoa
  14 días sin compra · ciclo 9 días
  → Armar pedido
  Por qué:  compra cada ~9 días · lleva 14 · vale $300.000 al mes
  En juego: $75.000
```

La diferencia es el botón y el porqué. Una alerta obliga al vendedor a
salir a buscar el contexto; una decisión se la puede repetir al cliente
tal cual.

Por eso `actionLabel` y `why` son obligatorios: si una regla no puede
producirlos, no genera decisión.

## El puntaje

```
score = urgencia .30 + valor .25 + probabilidad .20
      + accionable .15 + confianza .10
```

`accionable` está ahí por algo: una decisión que el vendedor no puede
ejecutar en terreno no sirve, por urgente que sea.

`confianza` baja cuando hay pocos datos. Un cliente con dos compras no
tiene ritmo medible, y el motor lo dice en vez de fingir precisión.

| Atención | Score |
|---|---|
| `now` | ≥ 78 |
| `today` | ≥ 55 |
| `week` | ≥ 40 |
| ignorar | < 40 |

## El ciclo propio manda

Un hotel que compra cada 7 días y una pizzería que compra cada 30 no se
miden con la misma vara: **con 20 días de atraso el hotel está perdido y
la pizzería está normal.**

Por eso `ciclo_dias` se calcula por cliente, con la **mediana** de los
días entre compras — el promedio lo destruye una compra de Navidad — y
sólo cuando hay al menos tres compras en doce meses. Con menos, el motor
declara `sin_ritmo` en vez de inventar un ciclo con dos puntos.

Está probado: dos clientes con 20 días de atraso y distinto ciclo dan
puntajes distintos.

## Dos reglas de arquitectura

**1 · El motor es puro.** No importa Supabase ni React. Recibe datos y
devuelve decisiones. Por eso se prueba sin base, sin navegador y sin
señal — que es donde vive el vendedor la mitad del día.

**2 · El motor no calcula sus entradas.** `ciclo_dias`, `venta_mensual`
y `estado_fuga` llegan de `api.decision_cartera` (migración 034).

En la 15.4 se deducían en el teléfono, y por eso el mismo cliente salía
«en riesgo» en Hoy y «al día» en el dashboard: cada pantalla elegía su
umbral. La definición vive una sola vez, en SQL.

## Qué encontró el port

Al portarlo de la 15.4 con pruebas, aparecieron dos errores reales:

**El vocabulario de estados había cambiado.** El motor buscaba
`DORMIDO` y `RIESGO`; la 2.0 los llama `en_fuga` y `perdido`. La rama de
rescate no se activaba nunca.

**Reposición se comía a rescate.** Entre 30 y 45 días los dos rangos se
solapan y ganaba reposición. A un cliente que se está yendo se le
ofrecía «armar pedido» como visita de rutina, y se perdía el momento de
rescatarlo. Ahora rescate se evalúa primero cuando el servidor marca
fuga.

Ninguno de los dos se habría visto mirando la pantalla: los dos casos
muestran algo razonable, sólo que equivocado.

## Las pruebas

```bash
cd apps/field && npm test
```

Ocho, y corren en el CI dentro de `npm run verify`. No prueban «que
funcione»: prueban que las reglas del negocio digan lo que el negocio
necesita.

| Prueba | Regla |
|---|---|
| Cliente bloqueado | Nunca genera decisión |
| Sin historial | No se inventa una |
| Atrasado sobre su ciclo | Propone reponer, con porqué |
| Ciclo corto vs largo | El ciclo propio manda |
| Grande vs chico | A igual atraso, gana el que vale más |
| Cliente en fuga | Es rescate, no reposición |
| El feed | Ordenado, y la primera es la de mayor score |
| Todas | Traen acción, porqué y urgencia |
