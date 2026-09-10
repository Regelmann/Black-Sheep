# App de terreno

La PWA del vendedor. React + Vite, sin dependencias pesadas: el bundle
de la app pesa **28 kB**.

```bash
cp .env.example .env
npm install && npm run dev
npm run verify      # guard + build
```

## La idea central: el trabajo nunca se pierde

El vendedor trabaja en la calle, con señal intermitente, y a veces sin
señal por horas. Todo lo que registra pasa por una cola:

```
tocar "Guardar"  →  IndexedDB (durable)  →  cola  →  api.*  →  base
                    ↑ instantáneo                    ↑ cuando haya red
```

Nunca espera a la red para seguir trabajando. La franja de arriba dice
siempre cuántos registros están por subir; cuando no queda nada,
desaparece sola. Si el vendedor no sabe si su trabajo se guardó, vuelve
al cuaderno.

**Reintentar es seguro.** Cada operación lleva un `client_op_id` que
genera el teléfono; el servidor aplica `ON CONFLICT DO NOTHING`. Tocar
"Reintentar" diez veces produce un pedido, no diez.

La mecánica de la cola (IndexedDB con respaldo en localStorage, reintento
con espera exponencial, items agotados que esperan decisión humana) se
heredó de la 15.3 sin tocar: es el código más probado del producto.

## Pantallas

| Pantalla | Qué muestra | De dónde |
|---|---|---|
| Hoy | Cuánto lleva vendido, avance a meta, a quién llamar | `api.mi_dia`, `api.llamar_hoy` |
| Ruta | Paradas del día en orden, con qué ofrecer en cada una | `api.ruta_dia` |
| Clientes | Su cartera, filtrable, buscable | `api.mi_cartera` |
| Cliente | Marcar llegada, nota, pedido, visita sin venta | `api.registrar_*`, `api.crear_pedido` |
| Pedidos | Primero lo que está en el teléfono, después lo enviado | cola + `api.mis_pedidos` |

Ningún cálculo vive acá. "Cliente cayendo" significa lo mismo en el
teléfono, en el dashboard y en el reporte del lunes porque se define una
sola vez, en SQL (D-07).

## Decisiones de terreno

**Todo lo tocable mide 48 px.** Se usa de pie, con una mano, a veces con
guantes.

**El texto base es de 16 px.** Menos que eso y iOS hace zoom solo al
tocar un campo.

**El GPS es opcional.** Si el vendedor tiene la ubicación apagada, el
check-in se registra igual sin coordenadas. Bloquear la visita por falta
de permiso es castigar al que sí está trabajando. Además sólo se guarda
si la empresa tiene contratada la capacidad `checkin_gps`: es dato
personal de un trabajador.

**El total del pedido es una referencia.** El precio que vale lo calcula
el servidor al recibirlo: la app pudo haberse cargado hace tres horas.
La pantalla lo dice con todas las letras.

**Un cliente bloqueado no acepta pedido.** El botón se desactiva y el
servidor lo rechaza igual, por si alguien llega por otro camino.

**Los chunks se separan por frecuencia de cambio**, no por tamaño. React
y Supabase cambian cada varios meses; la app cada deploy. Si viajaran
juntos, cada deploy obligaría a rebajar 390 kB en 4G.
