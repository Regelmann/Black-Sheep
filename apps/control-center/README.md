# Control Center

Lo que opera **Black Sheep**. Va en `admin.black-sheep.cl`, en su propio
despliegue, separado del dashboard de los clientes.

```bash
cp .env.example .env
npm install && npm run dev
npm run verify
```

## Por qué es una app aparte

Antes vivía dentro del dashboard de gerencia y se mostraba según el rol.
Funcionaba y era seguro —el servidor valida `es_superadmin()` en cada
función— pero mezclaba dos productos con dos audiencias y dos niveles de
privilegio en un mismo build. Un cambio en el dashboard de un cliente no
tiene por qué poder tocar la consola que suspende empresas.

**La barra lateral va en ámbar y no en pizarra.** Si tienes las dos
pestañas abiertas, tiene que ser evidente de un vistazo en cuál estás
antes de apretar «Suspender».

## Pantallas

| Pantalla | Para qué |
|---|---|
| **Empresas** | Quién opera, quién debe, cuánto entra al mes |
| **Ficha de empresa** | Puesta en marcha, suscripción, pagos, capacidades, usuarios, tipos de documento, cargas |
| **Cobranza** | A quién llamar hoy: cortadas, morosas, por vencer, en prueba |
| **Dar de alta** | Empresa nueva, con su dirección y su color |

## La puesta en marcha, en la ficha

Cuatro pasos con su marca de hecho o pendiente:

1. **Tipos de documento** — sin esto la venta queda en cero
2. **Usuarios con acceso** — nadie puede entrar todavía
3. **Maestra y precios** — todavía no cargan sus archivos
4. **Histórico de ventas** — sin histórico todos los clientes salen como nuevos

Es la pantalla que se abre cuando alguien pregunta «¿por qué esta
empresa no ve nada?».

## Suspender y reactivar

Suspender corta el acceso **al instante**, en todas las pantallas de esa
empresa, porque el corte vive en la RLS y no en la interfaz. **Nada se
borra**: al registrar el pago la empresa vuelve entera.

Hay tres estados operables desde acá:

| Botón | Efecto |
|---|---|
| Registrar pago | Deja la suscripción activa y extiende un mes |
| Marcar morosa | Sigue operando durante los días de gracia |
| Suspender | Sin acceso ahora mismo |

La gracia existe porque cortarle el día a tres vendedores en la calle
por una transferencia atrasada es una mala decisión comercial disfrazada
de rigor técnico.

## Usuarios

El alta de la cuenta se hace en Supabase (Authentication → Invite user).
Acá se **asigna** esa cuenta a una empresa con un rol. El acceso cambia
en su próximo inicio de sesión, porque los claims se arman al emitir el
token (027).

Quitar el acceso **desactiva la membresía, no borra al usuario**: la
auditoría tiene que poder decir quién publicó aquel lote de marzo.
