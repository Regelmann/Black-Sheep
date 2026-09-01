# Black Sheep V13.1 — Ventas Integral

Integra el Ciclo Único, ventas históricas + Nuevas ventas, Pedido → Factura → NC,
analítica Supabase, app Ventas, catálogo y web.

## Orden
1. SQL 44 (si falta)
2. SQL 46
3. `scripts/CICLO_UNICO.py`
4. cargar ambos Excel
5. prueba `KF_SKIP_SUPABASE=1`
6. corrida Supabase
7. deploy field
8. deploy web

Reglas: PEDIDO no suma venta; FACTURA positiva; NC negativa; venta neta = factura - NC.
`ventas_lineas` no recibe PEDIDO. No hay fuzzy matching automático.

## Verificación local
El script Python compila correctamente. El build de Field no pudo completarse en este entorno porque `vite` no quedó instalado antes del timeout de npm; no se declara build exitoso.
