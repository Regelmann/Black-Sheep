# Control Center data contract

## Read path

`UI -> selectors/metrics -> repositories -> Supabase`

## Write path

`UI -> actions -> Supabase`

Writes must only target tables/functions confirmed in the production schema. Unverified actions must fail closed.

## Initial sources

- `gerencia`: management sales summary
- `tendencia`: sales trend
- `gerencia_clientes`: customer management summary
- `cartera`: customer ownership/portfolio
- `ventas_lineas`: customer/product sales detail
- `ejecutivos`: executive directory
- `stock`: inventory
- `notas_cliente`: customer activity/notes
