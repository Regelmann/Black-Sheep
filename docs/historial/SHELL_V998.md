# v-BS-PLATFORM-V9.9.8 — App Shell

**76/76 · guard ✅ · build ✓**

## El diagnóstico tiene nombre

Tu queja —*"debería haber una estructura de app y que sea siempre igual en
todas las pestañas, no una aparte de la otra"*— describe un problema conocido
con solución conocida: el **App Shell pattern**.

La definición del problema es casi literal:

> Las pantallas se comportan como vistas aisladas sin estructura consistente.
> Sin un layout compartido, cada pantalla duplica la estructura, creando
> inconsistencia y costo de mantenimiento extra.

Eso era exactamente la app: Hoy con su padding, Clientes con su hero, Stock con
sus chips, Gerencia con su propio tamaño de título. Cinco pestañas, cinco
layouts.

## `components/layout/PageShell.jsx`

Una estructura. Siempre en el mismo orden:

```
┌─────────────────────────────┐
│ HERO      título · subtítulo│  contexto, nunca acción
├─────────────────────────────┤
│ STATS     contadores        │  opcional
├─────────────────────────────┤
│ BUSCAR                      │  opcional
│ FILTROS                     │  sticky al scrollear
├─────────────────────────────┤
│ CONTENIDO                   │
├─────────────────────────────┤
│ CTA fija                    │  zona del pulgar
└─────────────────────────────┘
```

**Regla:** ninguna página define su propio padding, hero ni contenedor de
scroll. Si algo cambia en las cinco pestañas, se cambia en un archivo.

Aplicado a **Cartera**, **Stock** y **Gerencia**.

### Detalles

- **Filtros sticky**: se pegan arriba al scrollear. El vendedor filtra sin
  volver a subir. Se marca un borde al despegarse para que se note que flota.
- **Un solo lugar decide** carga / error / vacío. Antes cada página lo
  resolvía distinto, y algunas mostraban "0 resultados" cuando en realidad la
  consulta había fallado.
- **Los layouts viejos quedan neutralizados**: `.wrap`, `.bs-page-body` y
  `.container` pierden su padding dentro del shell, para que el margen no se
  duplique.
- **`bs-shell-title` con `color: #fff` explícito** — heredar daba texto negro
  sobre fondo negro, que fue el bug de "Mi cartera" invisible.

## Guard R13

```
[R13 hero propio]  pages/Admin.jsx — usar PageShell en vez de bs-page-hero
```

Detecta cualquier página que vuelva a montar su propio hero. Ya encontró que
falta migrar Admin.

## Pendiente

- Migrar `Admin.jsx` y `Ruta.jsx` al shell (R13 los va a seguir marcando)
- Editor de catálogo: estética de formulario viejo
- "ver causa" en Gerencia no navega
- Control Center
