# Catálogo web V2.5 SHOP — página de ventas premium

## Referencias aplicadas (Awwwards / Baymard / B2B 2025)

- Hero editorial oscuro + tipografía grande (commerce minimal)
- Grid de producto con imagen 1:1 dominante y hover sutil
- Chips de categoría + búsqueda sticky
- Vista grilla / lista
- Drawer de pedido + FAB sticky (mobile conversion)
- Modal tipo product page (foto + precio + ficha técnica)
- Badges de precio personalizado (B2B): Negociado / Tu precio / Lista
- Copy tenant-agnostic (sirve food, ferretería, cosméticos, etc.)

## Marca por tenant

```
VITE_PUBLIC_BRAND=KeyFoods
```

Sin variable → "Black Sheep".

## Deploy

1. SQL: `10b_STOCK_MEDIA_COLS.sql` + `10_CATALOGO_WEB_V24.sql`
2. Ciclo con lista de precios (+ PRODUCTOS_MEDIA opcional)
3. Push field → stamp `v-BS-PLATFORM-V2.5-SHOP`
4. Abrir `/catalogo/:token`

## Escala multi-cliente

El mismo componente sirve a cualquier rubro:
- Categorías = `subfamilia` / `categoria` del stock
- Media = URLs genéricas
- Precios = negociado → histórico → lista
