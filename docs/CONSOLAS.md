# Las dos consolas

Dos pantallas distintas, con dos audiencias distintas y dos niveles de
privilegio distintos. No comparten datos ni permisos.

---

# A · Dashboard de gerencia

Lo opera **cada empresa**, sobre sus propios datos. Rol `gerencia` o
`tenant_admin`.

## 1 · Cargar los archivos

| Elemento | Función / vista |
|---|---|
| Subir archivo | `api.registrar_carga(tipo, nombre, sha256, bytes, path)` → `lote_id` |
| Enviar las filas | `api.agregar_filas(lote_id, filas_json)` |
| Ver cargas | `api.cargas` |
| Ver qué se excluyó y por qué | `api.carga_exclusiones` |
| **Publicar** | `api.publicar_lote(lote_id, umbral_pct)` |

Lo que la pantalla tiene que mostrar, sí o sí:

- **El resultado de la reconciliación antes de publicar.** Venta
  calculada contra total oficial, y la diferencia en porcentaje.
- **Las filas excluidas, agrupadas por motivo.** `TIPO_DOC_DESCONOCIDO`,
  `CLIENTE_SIN_MAESTRA`, `SKU_SIN_PRECIO`. Nada desaparece en silencio.
- **El aviso de archivo repetido.** Si el hash ya se cargó, se avisa. No
  se bloquea: puede ser legítimo. Pero no puede pasar desapercibido, que
  es como se duplicó la venta en la 15.3.

`publicar_lote` **rechaza** un lote sin reconciliación. Publicar primero
y revisar después es cómo una cifra mala llega al teléfono de un vendedor.

## 2 · Metas por ejecutivo

`api.set_meta(ejecutivo, mes, monto)` · capacidad `metas_ejecutivo`.
Meta mensual en pesos. Si la empresa no usa metas, se apaga la capacidad
y la tarjeta de avance desaparece de la app en vez de mostrar 0%.

## 3 · Focos del mes

`api.set_foco(mes, sku, meta_unidades, zona)` · capacidad `foco_sku`.

**Acá está el caso que te importa:** una empresa que sólo mide venta
total y no por producto apaga `venta_por_sku` y `foco_sku`. La función
rechaza la operación con `capacidad_desactivada`, y el dashboard no
dibuja la sección. Mismo producto, mismo código, distinta configuración.

## 4 · Ejecutivos

| Acción | Función |
|---|---|
| Alta / edición | `api.alta_ejecutivo(id, nombre, zona, email, usuario)` |
| Baja | `api.baja_ejecutivo(id, reasignar_a)` |

La baja **no borra**: desactiva y opcionalmente reasigna la cartera. Un
ejecutivo borrado deja la venta histórica sin dueño.

## 5 · Zonas, comunas y reasignaciones

| Acción | Función |
|---|---|
| Comuna → zona | `api.set_zona_comuna(comuna, zona)` |
| Mover un cliente o prospecto | `api.reasignar_cliente(cliente_key, zona, ejecutivo)` |

**Advertencia que la pantalla debe mostrar al confirmar:** la próxima
carga de la maestra pisa esta reasignación, porque la maestra manda. Si
el cambio es permanente, hay que corregir el archivo.

## 6 · Panel de integridad

`api.integridad`. Es el panel que responde "¿por qué no aparece este
cliente?": zona y comuna contradictorias, clientes sin ubicación, SKU con
stock y sin precio, ventas de clientes ausentes de la maestra, zonas sin
ventas.

## 7 · Estado de la cuenta

`api.mi_suscripcion` · `api.mis_capacidades`. La empresa ve su plan, su
vencimiento y qué tiene contratado. Puede verlo; no puede modificarlo.

---

# B · Consola de plataforma

La opera **Black Sheep**. Requiere `rol_plataforma = superadmin` en el
JWT. Ninguna función de acá es alcanzable por un cliente: cada una
verifica `es_superadmin()` en el servidor y devuelve `sin_permiso`.

| Acción | Función |
|---|---|
| Ver todas las empresas | `api.admin_empresas()` |
| Alta de empresa | `api.admin_alta_empresa(slug, nombre, plan, dias_trial)` |
| Cambiar estado | `api.admin_set_suscripcion(tenant, estado, vigente_hasta, nota)` |
| Registrar un pago | `api.admin_registrar_pago(tenant, periodo, monto, ref, meses)` |
| Activar o apagar una capacidad | `api.admin_set_capacidad(tenant, capacidad, activa)` |

`admin_empresas()` devuelve, por empresa: plan, estado, vencimiento, días
restantes, si está habilitada, usuarios, clientes, venta del mes y fecha
de la última carga. Es la pantalla para saber quién debe y quién está
usando el producto.

## El corte por falta de pago

Esto es lo que hay que entender bien, porque es la pieza de seguridad
más importante de las dos consolas.

**El corte no vive en la app. Vive en la base de datos.**

Toda política RLS de `core`, `ingest` y `compliance` pasa por
`platform.tiene_acceso()`. Esa función exige, además de tenant correcto y
membresía activa, **suscripción vigente**. Suspender una empresa la deja
sin datos en todas las tablas a la vez.

Consecuencia práctica: un vendedor con la app abierta, la sesión viva y
el token válido deja de ver datos igual. No hay pantalla que se pueda
olvidar de chequear el pago, porque el chequeo no está en ninguna
pantalla. Un interruptor que se esquiva recargando la página no es un
interruptor.

| Estado | Efecto |
|---|---|
| `trial` | Opera normal |
| `activa` | Opera normal |
| `morosa` | Sigue operando hasta que vencen los días de gracia (5 por defecto) |
| `suspendida` | Sin acceso, inmediato |
| `cancelada` | Sin acceso, inmediato |

**Nada se borra.** Los datos quedan intactos y vuelven al instante
cuando se registra el pago. `admin_registrar_pago` deja el estado en
`activa` y extiende el vencimiento.

**Sin fila de suscripción no hay acceso.** Una empresa creada a mano sin
plan queda cerrada, no abierta. Está verificado en la prueba 10.

**Por qué existe la gracia:** cortarle el día a tres vendedores en la
calle por una transferencia que entra con dos días de atraso es una mala
decisión comercial disfrazada de rigor técnico.

---

## Cómo se aísla una empresa de otra

Cinco capas, en orden de aplicación:

1. **El esquema.** Sólo `api` está expuesto. `core`, `platform`, `ingest`
   y `compliance` no son alcanzables desde fuera.
2. **La RLS.** `ENABLE` + `FORCE` en toda tabla. `FORCE` aplica también
   al dueño: ni un proceso de fondo cruza el límite.
3. **El origen del tenant.** Sale del JWT (`app_metadata`), que escribe
   el servidor. Ninguna función de la app lo recibe por parámetro; el
   diagnóstico falla si alguien agrega una que sí.
4. **El permiso.** Sobre el tenant correcto, además hace falta el rol
   adecuado. Los datos de contacto exigen `ver_contacto`.
5. **La suscripción.** Aunque todo lo anterior esté bien, sin plan
   vigente no hay filas.

Verificado en las pruebas 1, 8, 10 y 11: un usuario de la empresa A que
manipula su token para pedir la empresa B obtiene **cero filas**.
