# Multi-empresa / multi-tenant — qué parametrizar

KeyFoods Field está pensado para **replicarse** (alimentos hoy, tornillos mañana).
La lógica comercial (precios, reposición, pedido) es genérica; lo que cambia es **configuración y datos**.

## Capas

```
┌─────────────────────────────────────────────┐
│  TENANT CONFIG (marca, labels, unidades)    │  ← por empresa
├─────────────────────────────────────────────┤
│  MOTOR COMERCIAL (precios, catálogo, pedido)│  ← código compartido
├─────────────────────────────────────────────┤
│  DATOS (Excel/BQ/ERP → stock, clientes)     │  ← conectores por empresa
└─────────────────────────────────────────────┘
```

## 1. Identidad de marca (front)

Archivo sugerido: `src/config/tenant.js` (o env `VITE_*`)

| Parámetro | KeyFoods hoy | Ejemplo tornillería |
|-----------|--------------|---------------------|
| `brandName` | KEYFOODS | TORNILOS SA |
| `brandColor` | #c2410c | #0f766e |
| `logoUrl` | /brand/logo-*.png | /brand/tenant-logo.png |
| `currency` | CLP | CLP / USD |
| `locale` | es-CL | es-CL |
| `unitDefault` | kg / caja / un | un / caja / metro |
| `catalogTitle` | Lista de precios | Catálogo técnico |
| `sectionRepos` | Para reponer… | Para reponer… (igual) |
| `supportWhatsApp` | número | número |

Las **secciones del catálogo** (reponer / oportunidades / especiales) son de negocio genérico: no dependen de vender comida.

## 2. Vocabulario de stock (no hardcodear industria)

| Concepto canónico | KeyFoods | Tornillos |
|-------------------|----------|-----------|
| `sku_canon` | código producto | código / EAN |
| `producto_nombre` | descripción comercial | descripción |
| `unidad_venta` | caja / kg | caja / unidad |
| `stock_operativo` | kg o un | un |
| `cobertura_dias` | días de stock | días |
| `es_foco_mes` | foco comercial | promo del mes |
| `precio_unidad` / caja / kilo | precios | precio_unidad (caja opcional) |

Regla: el front y el SQL solo hablan **campos canónicos**.  
El conector de datos mapea el ERP/Excel de cada empresa a esos campos.

## 3. Fuentes de datos (conectores)

Por tenant, un manifiesto:

```yaml
tenant_id: keyfoods
sources:
  stock:
    type: bigquery   # o excel | api | csv
    table: gold.looker_04_stock_decision_final
  precios:
    type: excel
    path_env: KF_PRECIOS_XLSX
    columns:
      sku: Código
      precio_unidad: Precio Unidad
      nombre: Descripcion
  clientes:
    type: bigquery
  media:
    type: folder
    path_env: KF_MEDIA_DIR
    pattern: "{sku}.*"
supabase:
  url_env: SUPABASE_URL
  key_env: SUPABASE_SERVICE_KEY
```

El **ciclo de producción** (`KEYFOODS_CICLO_PRODUCCION.py`) debe leer este manifiesto en lugar de paths hardcodeados a “Keyfoods/00_PRODUCCION…”.

## 4. Qué NO reescribir por empresa

- `resolverPrecio` / jerarquía negociado → histórico → lista  
- Orden del catálogo (reposición → ofertas → especiales → resto)  
- `crear_pedido_publico` (validación server-side)  
- Smart reposición (cadencia / ratio)  
- Order bridge hacia logística  

Solo cambian: conectores, marca, y opcionalmente umbrales (`ratio_reposicion` 0.85, cobertura < 7 días).

## 5. Umbrales comerciales (config)

```js
export const commercialDefaults = {
  reposicionRatioMin: 0.85,
  coberturaCortaDias: 7,
  coberturaSobrestockDias: 30,
  hardStockGate: true, // pedido rechaza sin stock
}
```

## 6. Checklist al onboardear un cliente nuevo

- [ ] Crear proyecto Supabase (o schema) + correr SQL canónico  
- [ ] `tenant.js` + logos + colores  
- [ ] Manifiesto de fuentes (Excel/BQ/API)  
- [ ] Mapear columnas de lista de precios → sku / nombre / precios  
- [ ] Primera carga: ciclo producción (stock + precios + media)  
- [ ] Health: % con nombre, % con precio, % con imagen  
- [ ] Un pedido de prueba + stamp en producción  

## 7. Problema “solo se ve el código”

Causa de datos, no de UI: `stock.producto_nombre` vacío.

Mitigación en el motor (ya en CANON):

1. UI: `productTitle()` nunca deja la tarjeta muda; marca “sin nombre”.  
2. Patch precios: `KF_UPDATE_NOMBRE=1` rellena nombre/marca desde el Excel.  
3. Health: alertar `count where producto_nombre is null or producto_nombre ~ '^[0-9]+$'`.

Para tornillos igual: si el Excel trae descripción, el patch la escribe; si no, el UI avisa.
