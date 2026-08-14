# Focos Pollo/Hanks + clientes nuevos

## Problema
1. Focos sumaban `cantidad` (cajas/unidades) y la meta está en **KG / LT**.
2. FOCO_SKU incompleto → pocos SKUs contaban como Pollo/Hanks.
3. "Nuevos" en app incluía compras de **julio** hardcodeadas.

## Fix v1.20 + app v-LEAN-022
- Ciclo convierte a KG/LT con lista de precios (`kg_unidad` / `kg_caja`).
- Si FOCO_SKU tiene pocos SKUs, amplía por nombre de producto (POLLO|PECHUGA… / HANK|KETCHUP…).
- `es_nuevo_mes` = primera factura del cliente en el mes MTD.
- App: filtro Nuevos usa `es_nuevo_mes` o mes de `fecha_snapshot` (no julio fijo).

## Qué correr
1. Supabase: `SQL_ES_NUEVO_MES.sql`
2. Colab: `%run KEYFOODS_CICLO_LIMPIO_v1.20.py`
3. Revisar log:
   `foco NOR-PONIENTE/POLLO: skus=N vendido=X.X KG meta=2300`
4. Comparar con planilla TV (meta pollo / hanks por ejecutivo).
5. Deploy front v-LEAN-022.

## Si Pollo sigue bajo
- Abrí hoja FOCO_SKU del Excel config y asegurá que **todos** los SKU de pollo estén con foco=POLLO.
- El fallback por nombre ayuda, pero el mapa es la fuente canónica.
