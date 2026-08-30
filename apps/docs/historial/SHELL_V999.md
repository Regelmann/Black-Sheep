# v-BS-PLATFORM-V9.9.9 — Shell completo

**76/76 · guard ✅ (R13 sin marcas) · build ✓**

## Las cinco pestañas, misma estructura

| Pestaña | Estado |
|---|---|
| Hoy | ✅ `bs-shell-hero` |
| Mapa / Ruta | ✅ pantalla completa a propósito — un mapa no lleva hero |
| Clientes | ✅ `PageShell` |
| Stock | ✅ `PageShell` |
| Gerencia | ✅ `bs-shell-hero` |
| Admin | ✅ `PageShell` + `FilterBar` |

**R13 ya no marca ninguna página.** Cuando alguna vuelva a montar su propio
hero, el guard lo va a decir.

### Admin

Las pestañas de administración usaban `filter-row` con `filter-btn`, un tercer
sistema de filtros distinto del de Clientes y del de Stock. Ahora usa el
`FilterBar` común: mismos chips, mismo tamaño, mismo comportamiento de scroll.

### Ruta

**No lleva shell, y es correcto.** Es un mapa a pantalla completa: meterle un
hero le sacaría 90px de mapa al vendedor sin darle nada.

## Editor de catálogo — "parece un sistema antiguo"

La causa era concreta: los `<input type="number">` y `<input type="checkbox">`
**no tenían estilo propio**. El navegador los pintaba con su apariencia nativa
—borde gris fino, checkbox azul del sistema— y por eso se veía como un
formulario de hace quince años.

Ahora:

- **Inputs de precio**: 46px de alto, radio 12, foco con halo naranja.
  Se quitaron las flechitas del `type=number`: no sirven para plata y roban
  ancho.
- **16px reales** en el texto: sin zoom automático al enfocar en iOS.
- **Números tabulares**: los precios no bailan al escribir.
- **El precio del cliente se distingue** del de lista: borde verde. Es el
  campo que el vendedor realmente negocia.
- **Los flags son interruptores**, no checkboxes del sistema: la etiqueta
  entera es tocable (42px) y se pinta de naranja al activarse.

## Pendiente

- "ver causa" en Gerencia no navega
- Control Center
- Catálogo público: hay que confirmar si falla por RLS o por otra cosa
