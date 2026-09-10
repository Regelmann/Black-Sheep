# Las cuatro superficies

Un producto, cuatro públicos distintos. Cada uno con su dominio, su
despliegue y su nivel de privilegio.

---

## El mapa

```
admin.black-sheep.cl            CONTROL CENTER
                                Black Sheep · superadmin
                                empresas · suscripciones · cobros · demos

<slug>.app.black-sheep.cl       OFICINA + RESUMEN
                                el cliente que te compra · PC primero
                                Resumen  → cómo va el equipo (lectura)
                                Oficina  → usuarios, carga, zonas, precios, metas

<slug>.terreno.black-sheep.cl   TERRENO
                                el vendedor · teléfono · PWA · offline
                                Hoy · Mapa · Clientes · Stock · Más

pedido.black-sheep.cl/<token>   CATÁLOGO
                                el cliente final · sin sesión
                                su precio · su pedido
```

Cuatro despliegues. **Un solo proyecto Supabase.** El tenant sale del
JWT; el subdominio sólo decide qué logo y qué color se pintan.

## Por qué el subdominio no elige la empresa

Podría parecer natural que `keyfoods.app.black-sheep.cl` "apunte" a
KeyFoods. No lo hace, y es a propósito.

El subdominio resuelve el **slug** para pintar la marca. Los datos salen
del token. Si alguien escribe `otraempresa.app.black-sheep.cl` con su
sesión de KeyFoods, ve KeyFoods: la RLS no sabe nada de subdominios.

Un build por empresa —que es lo que hace la 15.x con
`VITE_TENANT_KEYFOODS_ANON_KEY`— significa veinte despliegues con veinte
clientes, y un error de configuración basta para que una empresa vea a
otra.

## Los nombres, en el idioma del cliente

| Interno | Lo que dice la pantalla | Por qué |
|---|---|---|
| Control Center | **Black Sheep** | Sólo lo ves tú |
| Tenant admin | **Oficina** | El par natural de "Terreno". Nadie tiene que aprender qué es un tenant |
| Dashboard | **Resumen** | Es lo que va a buscar: cómo va el equipo |
| Field app | **Terreno** | Donde está el vendedor |

## Quién puede qué

| | Control Center | Resumen | Oficina | Terreno | Catálogo |
|---|---|---|---|---|---|
| superadmin (tú) | ✓ | ✓ | ✓ | ✓ | |
| tenant_admin | | ✓ | ✓ | ✓ | |
| gerencia | | ✓ | ✓ | ✓ | |
| ejecutivo | | | | ✓ | |
| solo_lectura | | ✓ | | | |
| cliente final | | | | | ✓ (token) |

El rol sale del token, lo escribe el hook (027). Esconder un enlace es
comodidad; **cada función valida el permiso en el servidor**.

## Orden de construcción

1. **Control Center** ← acá estamos
2. **Oficina** — sin esto el cliente no puede operar solo
3. **Resumen** — la pantalla que abre el gerente en el PC
4. **Terreno** — ya compila, faltan Mapa y Más
5. **Catálogo** — la que ve el cliente final

Se cierra una antes de abrir la siguiente.
