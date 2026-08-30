# v-BS-PLATFORM-V10.0-SHELL — Fase 1

**76/76 · guard ✅ · build ✓ · 21 archivos movidos**

## Sobre el método: por qué NO hice el "un solo golpe"

El destino del `STRUCTURE_V10.md` es correcto y lo implementé. El **método**
propuesto —mover todo y decidir GO/NO-GO al final, con rollback al zip— tiene
tres problemas hoy:

1. **V9.9.9 no está desplegada.** En las capturas corre V9.9.6. Reestructurar
   60 archivos sobre una base que no sabés si funciona en el teléfono agrega
   una variable en el peor momento.
2. **Hay bugs abiertos sin diagnosticar** (catálogo, Control Center, "ver
   causa"). Si migrás y algo falla, no vas a poder distinguir si lo rompió la
   migración o si ya estaba roto.
3. **Rollback al zip pierde el trabajo del intento.** Un `git revert` no.

Y hay evidencia concreta: V9.0, V92.4 y V9.8 llegaron sin compilar. Mover
archivos es exactamente la operación donde se esconden las regresiones.

**Lo que hice:** el mismo destino, con `npm run verify` después de cada
movimiento. Fue lo correcto — encontró tres roturas que un solo golpe habría
mezclado.

## Lo que se movió

```
components/domain/AppHeader     → chrome/
components/domain/SyncBanner    → chrome/
components/layout/PageShell     → shells/
components/layout/AppShell      → shells/
components/{15 archivos}        → domain/
components/DataState            → ui/
```

Imports reescritos automáticamente: **29**. Barriles `index.js` en las cuatro
carpetas: si un componente cambia de nombre o de carpeta, se toca una línea.

## Las tres roturas que la verificación incremental encontró

**1 · Referencias cruzadas entre archivos movidos juntos.**
`AppHeader` importaba `./ZoneSegmented.jsx`; los dos se movieron, pero a
carpetas distintas. El script no lo cubría.

**2 · Profundidad relativa.** `chrome/` y `domain/` quedaron a un nivel de
`src` (antes `components/domain` estaba a dos). Todos los `../../` había que
bajarlos a `../`.

**3 · 🔴 `ui/index.jsx` nunca existió.**

```js
import { KfProgress } from '../ui/index.jsx'   // GoalCard, desde V9.0
```

Ese archivo **no estaba en el repo**. Lo detecté en la primera revisión del
paquete de arquitectura y seguía latente, porque `GoalCard` nunca llegó a
cablearse en ninguna página: un import roto que sólo explota el día que
alguien usa el componente.

El guard (R1) lo atrapó al reestructurar. Se implementó `ui/KfProgress.jsx`
de verdad, con barra accesible y transición que respeta `reduce-motion`.

## Estructura actual

```
src/
├── app/        (creada, vacía — providers/routes en Fase 2)
├── chrome/     AppHeader · SyncBanner        ← App Shell global
├── shells/     AppShell · PageShell          ← templates de pantalla
├── domain/     16 componentes de negocio
├── ui/         DataState · KfProgress        ← design system atómico
├── pages/      orquestación
├── hooks/ lib/ styles/
```

Faltan de `STRUCTURE_V10`: `HubShell`, `FlowShell`, `MapShell`, `BottomNav`,
`BootScreen`, `app/providers`, `app/routes`. Son Fase 2 — crearlos ahora sin
cablearlos sería andamiaje muerto, como ya pasó con `GoalCard`.

## Siguiente paso recomendado

**Desplegar esto y probarlo**, antes de seguir moviendo.

Esta versión no cambia una sola línea de UX: es puro movimiento de archivos.
Es el momento más seguro para verificar que nada se rompió — si el teléfono
se comporta igual que con V9.9.9, la reestructuración está limpia.

Después: Fase 2 (HubShell + FlowShell) con la misma verificación por pasos.
