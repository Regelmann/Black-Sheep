# push.js · escrito, con tests, SIN CABLEAR

`lib/push.js` (149 líneas) y `push.test.js` (7 tests) están completos y
verifican bien. **Ninguna pantalla los usa.**

Falta un solo paso: un botón "Avisame de ofertas" en `CatalogoCliente.jsx`
que llame a `suscribirPush(token)`.

El SQL ya está: `37_PUSH_SUSCRIPCIONES.sql` y `38_PUSH_AUTO.sql`.

**No se borró** porque el trabajo está hecho y es correcto — a diferencia de
los barriles y el hook de GPS, que eran duplicados de algo que ya existía.
Pero mientras no se cablee, es andamiaje: el mismo patrón de `GoalCard`, que
estuvo dos meses en el repo con un import roto adentro porque nadie lo usaba.

Si en dos versiones más sigue sin cablearse, conviene sacarlo.
