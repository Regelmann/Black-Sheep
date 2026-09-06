# Contrato de datos — los 4 archivos

Todo lo que la plataforma sabe sale de **cuatro archivos**. Este documento
define qué columnas necesita cada uno para que una empresa nueva pueda
arrancar sin tocar código.

Las columnas se sacaron del ciclo real (`CICLO_UNICO.py`) y de los archivos
de KeyFoods, no de una idea de cómo deberían ser.

---

## El orden importa

```
LISTA DE PRECIOS  →  define QUÉ SE VENDE      (base del catálogo)
STOCK             →  define SI HAY            (disponibilidad, no catálogo)
MAESTRA           →  define DE QUIÉN ES       (cliente → ejecutivo → canal)
VENTAS            →  define QUÉ COMPRÓ        (historial, ciclos, mix)
```

**La maestra manda.** El canal y el ejecutivo de cada cliente salen de ahí,
nunca del código de vendedor de la factura — ese puede decir `VENDEDOR_07` y
no significar nada comercial.

---

## 1 · LISTA DE PRECIOS — qué se vende

Es la **base del catálogo**. Un producto que no está acá no se vende, aunque
haya stock.

### Obligatorias

| Columna | Ejemplo | Por qué |
|---|---|---|
| `Código` | `300914992` | SKU. Es la llave contra stock y ventas |
| `Descripcion` | `ACEITE 100% MARAVILLA 1X5LT` | Lo que ve el cliente |
| `Precio Unidad` **o** `Precio Caja` | `10250` | Sin precio no se puede vender |

### Recomendadas

| Columna | Para qué |
|---|---|
| `Categoría` · `Marca` | Agrupar el catálogo y sugerir por rubro |
| `Unidad de Venta` | `BIDON`, `CAJA` — evita pedidos mal armados |
| `Unidades por Caja` · `Kilogramos por Unidad` | Convertir entre unidades |
| `Precio Kilo` | Comparar productos de distinto formato |

> **Nota real:** el archivo de KeyFoods trae `Precio Kilo`, `Precio Caja` y
> `Precio Unidad` **duplicados** (`.1`) — dos listas en una hoja. El ciclo usa
> la primera. Si tenés más de una lista, mejor en pestañas separadas.

---

## 2 · STOCK — si hay

**No define el catálogo**: informa disponibilidad. Un SKU con stock pero sin
precio es operativo, no vendible — el ciclo lo marca `SIN_PRECIO_LISTA`.

### Obligatorias

| Columna | Alias que acepta | Por qué |
|---|---|---|
| `CODIGO` | `SKU`, `CODIGO SKU KL` | Llave contra la lista de precios |
| `STOCK` | `STOCK TOTAL`, `STOCK KG`, `KILOS` | Cuánto hay |

### Recomendadas

| Columna | Para qué |
|---|---|
| `DESCRIPCION` | Verificar que el SKU cruzó bien |
| `FAMILIA` | Agrupar y sugerir |
| `ALMACEN` | Separar bodegas |
| `STOCK CAJAS` | Mostrar en la unidad que el vendedor usa |

**Corta fecha** (opcional, hoja aparte): SKU + fecha de vencimiento. Genera
las alertas de "empujar antes de que venza".

---

## 3 · MAESTRA — de quién es cada cliente

El archivo más importante de los cuatro. Define quién trabaja a quién.

### Obligatorias

| Columna | Ejemplo | Por qué |
|---|---|---|
| `rut` / `cliente_key` | `76491307-C` | Llave del cliente en todo el sistema |
| `EJECUTIVO` | `Sebastián Vargas` | Quién lo atiende |
| `zona` / canal | `NOR-ORIENTE`, `KAM`, `TELEVENTA` | A qué canal pertenece |

### Recomendadas

| Columna | Para qué |
|---|---|
| `RAZON SOCIAL` / nombre | Lo que ve el vendedor |
| `COMUNA` · `DIRECCION` | Mapa y ruta. **Sin esto el cliente no aparece en el mapa** |
| `es_bloqueado` | Cerrado o con deuda: no empujar venta |
| `rubro` / `giro` | Sugerir productos por tipo de negocio |
| `lat` · `lng` | Si no vienen, se geocodifican por dirección |

> ⚠️ **La contradicción que hace desaparecer clientes:** si la `zona` dice
> `NOR-ORIENTE` pero la `COMUNA` es de otra zona, el cliente **no lo ve
> nadie** — la consulta lo trae por zona y el filtro lo descarta por comuna.
> El dashboard tiene un panel que los lista.

---

## 4 · VENTAS — qué compró cada uno

De acá salen los ciclos de reposición, el mix, las alertas de fuga y todo el
motor de decisión.

### Obligatorias

| Columna | Alias | Por qué |
|---|---|---|
| `COD CLIENTE` | `CODIGO_CLIENTE` | Cruce con la maestra |
| `FECHA` | | Ciclos, días sin comprar, tendencia |
| `CODIGO` | `SKU`, `CODIGO_PRODUCTO` | Qué producto |
| `NETO` | `PRECIO` | Cuánto |
| `CANTIDAD` | | Para el ciclo de reposición |

### Recomendadas

| Columna | Para qué |
|---|---|
| `RAZON SOCIAL` · `COMUNA` · `DIRECCION` | Completar clientes que faltan en la maestra |
| `DESCRIPCION` / `PRODUCTO` | Legibilidad si el SKU no cruza |
| `NUMERO` (documento) | Idempotencia: evita duplicar al recargar |
| `EJECUTIVO` (vendedor de factura) | Sólo auditoría — **la maestra manda** |
| `TIPO` | Distinguir factura de nota de crédito |

### 🔴 Sobre el incremental

El ciclo calcula el promedio con `fecha < inicio_del_mes`. **Si subís sólo la
venta de hoy sin histórico**, todos los clientes salen como nuevos y sin
promedio.

Con `ventas_lineas` creada (`sql/41`), la primera corrida siembra el
histórico y de ahí en adelante subir sólo el día funciona: se **suma**, no
reemplaza. `linea_id` es un SHA1 de cliente + fecha + documento + sku +
monto, así que recargar el mismo archivo no duplica nada.

---

## Onboarding de una empresa nueva

```
1 · Crear el tenant           INSERT INTO tenants
2 · Correr los SQL            50 → 42 → 43 → 40 → 41 → 26
3 · Crear los usuarios        Supabase → Authentication → Add user
4 · Definir zonas             Dashboard → Zonas y ejecutivos
5 · Subir los 4 archivos      /{empresa}/dashboard → Cargar datos
6 · Correr el ciclo           una vez con histórico completo
7 · Verificar                 el diagnóstico de cada SQL
```

Nada de esto requiere tocar código. **Ese es el punto.**

---

## Lo que NO hace falta pedirle al cliente

- Dos archivos de venta (uno de cabecera y otro de líneas) — con uno alcanza
- Un ERP conectado — los Excel bastan
- Coordenadas — se geocodifican por dirección
- Fotos ni fichas técnicas — se cargan después desde el dashboard
- Metas — se ponen desde el dashboard, no vienen en archivo
