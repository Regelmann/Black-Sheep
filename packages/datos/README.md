# packages/datos

El cliente de Supabase y las utilidades que usan todas las apps.

| Archivo | Qué es |
|---|---|
| `supabase.js` | UN cliente. Esquema `api`. Claims leídos del token |
| `query.js` | `safeSelect`: ninguna consulta falla en silencio |
| `rpc.js` | Llamadas a funciones de `api` con errores en castellano |
| `formato.js` | Pesos, fechas y porcentajes en formato chileno |

Estaban copiados en tres apps. Un arreglo en uno no llegaba a los
otros, y así fue como `contextoDeSesion` leía los claims del lugar
equivocado en las tres a la vez.

**Vercel:** cada app tiene su Root Directory en `apps/<x>`, así que hay
que dejar activado *Include files outside the root directory in the
Build Step*. Viene activado por defecto.
