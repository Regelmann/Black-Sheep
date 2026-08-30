# Black Sheep Control Center — V13.0

Desktop management surface for management and administration.

## Product boundary

- Field: execute visits, routes, portfolio and orders.
- B2B Catalog: sell with customer-specific assortment and pricing.
- Control Center: decide, monitor and administer the commercial operation.

## Architecture

The Control Center must not query Supabase directly from pages/components. The intended flow is:

`page -> view model -> repository -> Supabase`

Business metrics belong in `metrics/`; write operations belong in `actions/`.

## Initial vertical slice

`Overview -> Canal -> Ejecutivo -> Cliente 360 -> Oportunidad`

This scaffold deliberately contains no fake KPI values and does not modify the existing Field `Gerencia.jsx`.
