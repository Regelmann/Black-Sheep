# Auditoría de arquitectura

**Versión auditada:** `v-BS-PLATFORM-V9.9.4` · 25 de agosto de 2026
**Contra:** estándares de arquitectura móvil offline-first y UX móvil 2026

Este documento sirve para dos cosas: saber si la app está bien construida, y
poder **replicarla** para otro cliente sin repetir los errores.

---

## Veredicto

**La app está bien encaminada, con una brecha crítica que se cerró en esta
versión y tres pendientes conocidas.**

El motor de negocio es una ventaja real y difícil de copiar. La arquitectura
técnica llegó tarde pero está tomando la forma correcta. Lo que faltaba —y era
grave— era **idempotencia en la cola offline**.

| Capa | Estado | Nota |
|---|---|---|
| Motor de datos / ETL | 🟢 Sólido | Ciclo único, maestra manda, VALIDAR/PUBLICAR |
| Lógica de negocio | 🟢 Sólido | Pura, testeada, separada de la UI |
| Capa de datos (lectura) | 🟢 Sólido | `safeSelect` + tolerancia a esquema |
| Cola offline | 🟡 Recién arreglado | Idempotencia agregada en V9.9.4 |
| Almacenamiento local | 🟡 Aceptable | localStorage; debería ser IndexedDB |
| UX / design system | 🟡 En transición | Sistema nuevo conviviendo con capas viejas |
| Rendimiento | 🟠 Pendiente | Bundle 730 kB, sin code-splitting |
| Seguridad (RLS) | 🔴 Riesgo | Políticas `USING(true)` en 13/14 |

---

## 1 · Los cuatro patrones de una app offline-first

El estándar define cuatro. Así estamos:

### 1.1 Almacenamiento local primero — 🟡

Hay `saveOfflineSnapshot` / `loadOfflineSnapshot`, pero sobre **localStorage**.

Problemas conocidos de localStorage:
- Límite ~5 MB. Una cartera de 3.000 clientes con `sku_detalle` se acerca.
- **Escritura síncrona: bloquea el hilo principal.** Guardar un snapshot
  grande produce un salto visible en la interfaz.
- Sólo strings: todo pasa por `JSON.stringify`.

Debería ser **IndexedDB**: asíncrona, sin bloquear, cientos de MB.

*Migración planificada en Fase 3.2 del ROADMAP. No es urgente con colas
chicas, sí lo es al crecer.*

### 1.2 Motor de sincronización — 🟢 (tras V9.9.4)

El estándar pide tres componentes: **cola de salida**, **procesador de
entrada**, **resolutor de conflictos**.

- Cola de salida ✅ `lib/offline.js` con backoff y tope de reintentos
- Handlers unificados ✅ `lib/syncHandlers.js`, fuente única
- Disparadores ✅ `online`, `visibilitychange`, `storage` — no polling
- Un solo flush a la vez ✅ store singleton con guarda `_inFlight`
- **Idempotencia ✅ agregada en V9.9.4** ← era el hueco crítico

### 🔴 La brecha que se cerró

Este era el hallazgo más grave de la auditoría:

```
1. Vendedor hace check-in en un subterráneo.
2. Vuelve la señal. El INSERT LLEGA a Supabase y se ejecuta.
3. La respuesta se pierde en el camino.
4. La app nunca recibió confirmación → el item sigue en la cola.
5. Reintenta → CHECK-IN DUPLICADO.
```

El dato ya estaba guardado. El reintento lo duplicó. **Con un pedido es peor:
se despacha dos veces.**

Ninguna cantidad de reintentos arregla esto. La solución es idempotencia:

- Cada acción encolada lleva un `client_op_id` (UUID, `crypto.randomUUID`)
- El reintento manda **el mismo id**
- Un índice único en la base lo rechaza con `23505`
- La app trata ese error como **éxito**: el dato está

`sql/27_IDEMPOTENCIA.sql` lo implementa y **prueba que el índice realmente
rechaza un duplicado** — no se limita a verificar que exista.

*Nota: el `id` anterior era `Date.now() + Math.random()`. Dos acciones en el
mismo milisegundo podían colisionar. Ahora es UUID v4.*

### 1.3 Resolución de conflictos — 🟡 aceptable para el dominio

El estándar plantea *last-write-wins*, resolución manual, o CRDTs.

**Acá no hace falta CRDT**, y conviene decir por qué: los datos que genera el
vendedor son **append-only y de un solo autor**. Un check-in, una nota, un
pedido — nadie más los edita concurrentemente. No hay documento compartido que
converger.

CRDT resuelve edición concurrente del mismo registro. Ese problema no existe
en este dominio. Meterlo sería complejidad sin beneficio.

**Lo que sí falta:** `updated_at` en las entidades editables (estado de
pedido, notas). Si un pedido se edita en la app y en el Control Center a la
vez, hoy gana el último que escribe sin registro de que hubo conflicto.

### 1.4 Estado de red visible — 🟢

`isProbablyOffline()`, `SyncBanner` con contador de pendientes, y el estándar
que pide *"que la interfaz refleje pendiente / sincronizando / sincronizado"*
está cubierto.

**Además:** el error se distingue del vacío (`DataState`). Una consulta que
falla ya no se muestra como "0 resultados". Eso está por encima del estándar:
la mayoría de las apps confunden las dos cosas.

---

## 2 · Separación de capas

```
lib/          6.317 líneas   lógica de negocio, pura y testeable
pages/        9.605 líneas   pantallas
components/   3.447 líneas   presentación reutilizable
hooks/          354 líneas   estado compartido
styles/       3.110 líneas   sistema visual
```

**Lo bueno:** la lógica de negocio está fuera de la UI. `planDia`, `goal`,
`decisionEngine`, `stockIntel`, `dataIntegrity` son funciones puras con tests.
Eso es lo que permite que 76 tests corran sin navegador ni base de datos.

**Lo malo:** `pages/` tiene 9.605 líneas y consultas directas a Supabase:

| Página | Consultas directas |
|---|---|
| `Admin.jsx` | 25 |
| `Visita.jsx` | 16 |
| `Ruta.jsx` | 9 |

El estándar pide un **repositorio** entre la UI y los datos. Hoy la pantalla
sabe de tablas y columnas. Por eso un cambio de esquema rompía pantallas
enteras — se mitigó con `columns.js`, pero la causa sigue.

**Cómo se arregla:** `lib/repos/carteraRepo.js`, `pedidosRepo.js`, etc. La
página pide `carteraRepo.deReponer(zona)` y no sabe qué tabla es.

*No es urgente. Es lo que hace la diferencia entre "funciona" y "se puede
mantener 5 años".*

---

## 3 · UX contra el estándar 2026

| Regla | Estado |
|---|---|
| CTA en el tercio inferior (zona del pulgar) | 🟢 |
| Barra inferior de 3–5 destinos | 🟢 5 |
| Objetivos táctiles ≥ 44px | 🟢 |
| Transiciones 150–300 ms | 🟢 200 ms |
| Sólo `transform` / `opacity` | 🟢 |
| `prefers-reduced-motion` desactiva | 🟢 |
| Háptica selectiva | 🟢 |
| Segmented control para 3–5 opciones | 🟢 corregido en V9.9 |
| 16px reales en inputs (anti-zoom iOS) | 🟢 |
| Contraste 4.5:1 | 🟡 sin auditar formalmente |
| LCP < 2,5 s | 🟠 bundle de 730 kB |
| Passkeys | ⚪ no aplica |

**El punto flojo es el rendimiento.** El estándar es tajante: *el 70% de los
usuarios espera menos de 2 segundos*. Con 730 kB en 4G de terreno no se
cumple. Gerencia y Admin se cargan aunque un vendedor nunca los abra.

`React.lazy` por ruta baja eso a menos de 250 kB. Es el cambio con mejor
relación esfuerzo/impacto que queda pendiente.

---

## 4 · Lo que está por encima del estándar

Tres cosas que la mayoría de las apps no tienen:

**1 · El guard de regresiones.** 10 reglas, cada una nacida de un bug que
llegó a producción. Ninguna guía de arquitectura menciona esto, y es lo que
evitó que se repitieran el `var()` circular y la función SQL duplicada.

**2 · Vacío ≠ roto.** `safeSelect` + `DataState`. La mayoría de las apps
muestran "0 resultados" cuando la consulta falló. Es la mentira más común en
software de datos.

**3 · Doble chequeo en escrituras.** `escribirYConfirmar` relee después de
escribir. El estándar habla de colas y reintentos, pero casi nunca de
confirmar que la escritura quedó.

---

## 5 · Riesgos abiertos, por gravedad

### 🔴 RLS abierto — bloqueante para multi-tenant

`13_ADMIN_PANEL.sql` y `14_ADMIN_CONTROL.sql` tienen políticas `USING(true)`:
cualquier usuario autenticado ve **todo**.

Con un solo tenant no duele. **El día que entre el segundo cliente, es una
fuga de datos entre empresas competidoras.** No es un bug de calidad: es un
incidente.

Debe cerrarse **antes** de vender el segundo tenant, no después.

### 🟠 Bundle de 730 kB
Code-splitting por ruta. Fase 3.1.

### 🟡 localStorage en vez de IndexedDB
Bloquea el hilo al guardar snapshots grandes. Fase 3.2.

### 🟡 Sin repositorios
Las páginas conocen tablas y columnas.

### 🟡 Sin `updated_at` en entidades editables
Sin registro de conflicto si un pedido se edita en dos lados.

---

## 6 · Para replicar esta app

Lo que hay que hacer **en este orden**. El orden importa: cada punto evita un
problema que ya pagamos.

### Antes de escribir una línea

1. **Una sola rama.** Tres entregas llegaron sin compilar por ramas paralelas
   que salían de una base vieja. Los bugs reparados reaparecían.
2. **CI desde el día uno.** `build + tests` bloqueando el merge. Cuesta media
   hora y evita el 100% de los ZIPs rotos.
3. **Un archivo, una función SQL.** `create or replace` sólo pisa la función
   de **firma idéntica**. Definirla en varios archivos deja versiones viejas
   vivas en la base. Nos costó dos bugs de producción.

### Capa de datos

4. **Ninguna consulta traga el error.** `const { data } = await supabase...`
   sin capturar `error` convierte "falló" en "0 resultados". Teníamos 27.
5. **Tolerancia a esquema.** PostgREST rechaza la consulta entera si una
   columna no existe. Resolver los nombres por alias, no asumirlos.
6. **Vacío ≠ roto.** Estados distintos, mensajes distintos.

### Cola offline

7. **Idempotencia desde el principio.** `client_op_id` + índice único. Sin
   esto, cada respuesta perdida es un duplicado.
8. **Contrato explícito de éxito.** `{ok:false}` es un objeto **truthy**.
   `if (await handler())` borraba items fallidos de la cola.
9. **Un solo flush.** N componentes suscritos, un solo drenaje. Dos flush
   simultáneos sobre la misma cola duplican escrituras.
10. **Tope de reintentos.** Sin él, un item corrupto bloquea la cola para
    siempre y esconde el problema real.

### Escrituras

11. **Doble chequeo.** Releer después de escribir. Sin error ≠ guardado.
12. **Upsert que no adivina.** Si no se puede verificar si existe, **abortar**.
    Duplicar es peor que fallar.

### UX

13. **3–5 opciones = segmented control, no desplegable.** Esconder opciones que
    caben en pantalla cuesta un toque de más, siempre.
14. **CTA abajo.** El tercio superior es zona de estiramiento.
15. **El color debe significar algo real.** Un 72% no es bueno ni malo: depende
    del día del mes. Colorear por umbral fijo miente.

### Datos

16. **Una fuente de verdad para la atribución.** La maestra manda. Nunca el
    código de vendedor del ERP.
17. **Compuerta VALIDAR/PUBLICAR.** Ninguna bajada llega a producción sin
    pasar chequeos de integridad.
18. **RLS estricto desde el día uno.** Agregarlo después de vender el segundo
    tenant es tarde.

---

## 7 · Lo que hace a esta app difícil de copiar

No es la interfaz. Es el motor:

- Atribución por maestra, no por código de ERP
- Precios en cascada: negociado → histórico → lista
- Cruce stock → compradores desde historial real
- Catálogo por cliente con orden comercial (lo que compra → su rubro → resto)
- Ritmo por días hábiles, no por porcentaje crudo

Un competidor puede copiar las pantallas en un mes. El ciclo de datos, la
atribución y las reglas de precio son años de dominio del negocio.

**La UX es lo que permite venderlo. El motor es lo que impide que te copien.**
