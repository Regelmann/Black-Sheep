# packages/ui

Los componentes visuales. **No conocen Supabase ni el negocio.**

| Componente | Para qué |
|---|---|
| `Armazon` | Barra lateral + lienzo. El mismo en las cuatro apps |
| `Titular` | Título, bajada y estado a la derecha |
| `Filtros` | Período, zona, ejecutivo… la misma barra en todas |
| `Kpi` | Ícono, etiqueta, cifra y variación |
| `Foco` | Problema → impacto → acción. Siempre con botón |
| `Insignia` | Activo · En riesgo · Recuperar · Prospecto |
| `Salud` | Puntaje 0-100 con barra |
| `Tabla` | Encabezado pegajoso, cifras a la derecha |
| `Vacio` | Qué hacer cuando no hay datos |

## Tres reglas

1. **Un componente de UI no importa `supabase`.** Si lo necesita, está
   mal pensado: recibe datos ya resueltos por props.
2. **Ninguna app define un color propio.** Todo sale de
   `packages/marca/tokens.css`.
3. **Un `Foco` sin acción no se muestra.** Un problema sin botón es
   decoración, no información.

## Por qué existe

Antes cada app copiaba su barra lateral y sus tarjetas. A la segunda
copia ya no se parecían. Un cambio visual global tiene que poder
hacerse acá y llegar a las cuatro.
