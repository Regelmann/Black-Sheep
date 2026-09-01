# Black Sheep — producto comercial V13.1

## Posicionamiento

Black Sheep no debe venderse como un dashboard ni como un reemplazo genérico de Power BI. El producto es una **plataforma vertical de ejecución comercial y decisiones** que convierte datos operacionales en acciones para terreno, gerencia y catálogo.

### Cadena de valor

`ERP/Excel → normalización → cliente/SKU → ventas → ciclo de recompra → stock/precio → pedido → factura → NC → próxima acción`

## Por qué es vendible

La plataforma ya tiene piezas que permiten una implementación repetible:

- multi-tenant y `KF_TENANT_ID` para separar clientes;
- ETL canónico en un único Ciclo Único;
- contrato de datos para histórico y ventas operativas;
- Supabase con RLS y vistas analíticas;
- PWA offline-first para vendedores;
- catálogo/pedido;
- gerencia y analítica de ventas;
- BUILD_STAMP, CI y release gate;
- documentación e historial separados del código operativo.

## Qué falta antes de prometer “enterprise-ready”

No se debe declarar una venta enterprise sólo por tener una UI bonita. Antes de cada cliente nuevo deben cerrarse:

1. Adaptador de ERP/Excel.
2. Mapeo de clientes y productos.
3. Tenant/RLS probado con dos usuarios de tenants distintos.
4. Smoke test móvil real, incluyendo modo avión.
5. Backups y rollback.
6. SLA y soporte.
7. Auditoría de permisos.
8. Validación de números contra el ERP del cliente.

## UX/UI objetivo 2026

La referencia actual de B2B SaaS favorece dashboards por rol, jerarquía de información, progressive disclosure, filtros/comparaciones y una acción clara. El dashboard debe responder rápidamente: **cómo estamos, qué cambió y qué hago ahora**.

La pantalla Ventas V13.1 aplica ese patrón: KPIs, comparación mensual, filtro de periodo, búsqueda, tabs de investigación y tablas de drill-down. Los estados de carga/error/vacío se tratan como parte de la experiencia y no como casos secundarios.

## Referencias de precio de mercado

Precios públicos consultados el 31-08-2026:

- Microsoft Power BI Pro: USD 14/usuario/mes; Premium por usuario: USD 24/usuario/mes.
- Tableau Cloud Standard: desde USD 15/usuario/mes; Enterprise: desde USD 35/usuario/mes.
- HubSpot Sales Hub Professional: desde USD 100/usuario/mes; Enterprise: desde USD 150/usuario/mes, con onboarding adicional en ciertos planes.

Estos productos son comparables sólo como anclas de presupuesto: Black Sheep tiene una propuesta vertical y de implementación, no debe competir únicamente por precio por usuario.

## Precio recomendado para Black Sheep

Esto es una **estrategia de precio recomendada**, no un promedio oficial de mercado.

### Pilot / Proof of Value

- Setup: CLP 2,5–5 millones.
- Duración: 6–8 semanas.
- Incluye una fuente ERP/Excel, carga histórica, catálogo, dashboard y un equipo piloto.
- Objetivo: demostrar reducción de trabajo manual y mejora de ejecución comercial.

### Standard

- Setup: CLP 3–7 millones.
- Suscripción: CLP 450.000–900.000/mes.
- Incluye hasta un tenant, integración estándar, usuarios comerciales/gerencia, ventas, stock, catálogo y soporte normal.

### Growth

- Setup: CLP 6–12 millones.
- Suscripción: CLP 900.000–1.800.000/mes.
- Incluye varias fuentes, automatizaciones, reportes avanzados, mayor volumen y soporte prioritario.

### Enterprise

- Setup: CLP 12–25+ millones.
- Suscripción: CLP 1.800.000–4.000.000+/mes.
- Precio por contrato según usuarios, fuentes, SLA, seguridad, integraciones, capacidad y soporte.

### Regla comercial

No cobrar sólo por cantidad de usuarios. Cobrar por **valor operativo + complejidad de integración + criticidad del servicio**. El precio por usuario puede existir como límite o escalador, pero no debe ser la unidad económica principal.

## Cómo replicarlo a otra empresa

No se copia la data de KeyFoods. Se copia la plataforma y se crea un adaptador por cliente.

```text
CORE BLACK SHEEP
      │
      ├── Tenant A → ERP adapter A → catálogo A → reglas A
      ├── Tenant B → ERP adapter B → catálogo B → reglas B
      └── Tenant C → ERP adapter C → catálogo C → reglas C
```

La meta es que un nuevo cliente requiera configuración y mapeo, no una bifurcación del código.

## Roadmap comercial recomendado

### Gate 1 — Producto vendible

- V13.1 desplegada.
- CI verde.
- Supabase verificado.
- Offline real probado.
- Ventas conciliadas contra ERP.
- Demo reproducible.

### Gate 2 — Repetibilidad

- Template de onboarding.
- Contrato de columnas por ERP.
- Tenant bootstrap automático.
- Checklist RLS de dos tenants.
- Seed de catálogo.
- Importador configurable.

### Gate 3 — Diferenciación

- Alertas de recompra.
- Next Best Action.
- Riesgo de fuga.
- Oportunidad por stock/precio.
- Forecast comercial.
- Explicación de cada recomendación.

### Gate 4 — Enterprise

- SSO.
- Auditoría de acciones.
- SLA.
- Backups/DR.
- Observabilidad.
- Exportación y APIs.
- Control de permisos por rol/tenant.

## Veredicto

V13.1 ya tiene suficiente producto para comenzar un **pilot comercial controlado**. Todavía no la presentaría como una plataforma enterprise terminada hasta completar los gates de seguridad multi-tenant, QA móvil real, onboarding repetible y operación/soporte.

La ventaja comercial no está en “tener más gráficos”: está en conectar la venta con la acción del vendedor y con la operación que la origina.
