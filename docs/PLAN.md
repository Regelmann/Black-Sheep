# Estado y plan

10 de septiembre de 2026.

---

## Qué está listo y probado

| Pieza | Estado |
|---|---|
| Base de datos (29 migraciones) | Listo · idempotente · 8/8 controles |
| Motor de carga de los 4 archivos | Listo · 7 pruebas de ciclo |
| Compuerta, respaldo y reversión | Listo |
| Edición desde el dashboard + conflictos | Listo · 9 pruebas |
| Suscripciones y corte por impago | Listo · en la RLS |
| Capacidades por empresa | Listo · 10 capacidades |
| **Precio por cliente** (acordado / histórico / lista) | **Listo · 6 pruebas** |
| Dashboard de gerencia | Compila · 6 pantallas |
| Consola de plataforma | Compila · dentro del dashboard |
| App de terreno | Compila · 5 pantallas · cola offline |
| Catálogo del cliente (servidor) | Listo · con precio negociado |
| Catálogo del cliente (pantalla) | **Falta** |
| Marca propia por empresa | **Falta** |

## Cuándo se puede cargar data de verdad

**Se puede hoy**, en este orden. Es media jornada.

1. Proyecto Supabase nuevo y correr las 29 migraciones.
2. `Settings → API → Exposed schemas`: dejar sólo `api`.
3. `Authentication → Hooks → Custom Access Token`:
   `platform.custom_access_token_hook`.
4. Sembrar tu superadmin (una línea, en `DEPLOY.md`).
5. Dar de alta KeyFoods desde la consola.
6. **Configurar sus tipos de documento.** Sin esto la venta queda en
   cero. Media hora mirando la columna de tipo en el Excel.
7. Cargar los cuatro archivos con **histórico completo** (12 meses
   ideal, 3 mínimo) y cuadrar contra el total oficial.

Después de eso KeyFoods opera y sirve de referencia para el resto.

---

## Lo que falta, en orden

### 1 · Catálogo del cliente (pantalla)
La única pieza del producto que ve el cliente final de la distribuidora.
El servidor ya está: `api.get_catalogo(token)` devuelve el precio de ESE
cliente. Falta la página pública que lo pinta y toma el pedido.
Es una app aparte, sin sesión, ligera.

### 2 · Marca propia por empresa
`keyfoods.blacksheep.cl` con su logo y su color. **Un solo despliegue**,
subdominio comodín; el subdominio resuelve el slug y el tenant sigue
saliendo del JWT.

No un build por empresa: eso es lo que hace la 15.x y es la razón por la
que con veinte clientes se vuelve inmanejable y un error de
configuración deja a una empresa viendo a otra.

### 3 · Separar la consola de plataforma
Hoy vive dentro del dashboard de gerencia y se muestra según el rol.
Funciona y es seguro (el servidor valida `es_superadmin`), pero conviene
que sea otro despliegue en otro dominio: reduce la superficie y evita
que un cambio en el dashboard toque la consola.

### 4 · Service worker
Que la app de terreno abra sin red la primera vez del día.

### 5 · Paneles de integridad en el Resumen
`api.integridad` ya los entrega, incluido el nuevo
`PRECIO_HISTORICO_FUERA_DE_BANDA`.

### 6 · Guardar el archivo original en Storage
Hoy se guardan el hash y las filas. El binario es la evidencia final.

---

## Cómo lo seguimos

Página por página, cerrando una antes de abrir la siguiente. El orden
que propongo, por valor comercial:

Ver `docs/SUPERFICIES.md` para el mapa completo.

1. ~~**Control Center**~~ — listo, en `apps/control-center`
2. **Oficina** — la administración del cliente sobre su propia app
3. **Resumen** — el dashboard del gerente, PC primero
4. **Terreno** — faltan Mapa y Más
5. **Catálogo del cliente final**

