# Panel de control de la app (Admin)

Ruta: **`/admin`** — usuarios con rol `gerente` | `admin` | `superadmin`

## Qué controlás sin Excel

| Pestaña | Qué hace | Tabla |
|---------|----------|--------|
| **Clientes** | Zona, comuna, ejecutivo | `cartera` |
| **Zonas** | Mapa comuna → zona | `zonas_comunas` |
| **Precios** | Precio unidad / caja | `stock` |
| **Fotos / fichas** | Imagen, PDF técnico, reseña | `stock` (+ Storage `productos`) |
| **Metas** | Meta $ mensual por ejecutivo | `metas` |
| **Focos SKU** | Focos KG/UN del mes + marcar SKU foco | `focos` + `stock.es_foco_mes` |

## SQL (una vez)

```
sql/14_ADMIN_CONTROL.sql
```

Incluye columnas media, RLS de escritura y tablas metas/focos.

### Fotos por upload

1. Supabase → **Storage** → New bucket  
2. Nombre: `productos`  
3. **Public bucket** = ON  
4. Policies: upload/read para `authenticated` (o público read)

Si no hay bucket, pegá URL de Drive:

`https://drive.google.com/uc?export=view&id=FILE_ID`

## Relación con el ciclo

| Dato | Admin (día a día) | Ciclo Excel (mensual) |
|------|-------------------|------------------------|
| Precios | Edición puntual | Republica desde lista |
| Media | Fuente recomendada | PRODUCTOS_MEDIA opcional |
| Metas / focos | Fuente operativa | CONFIG_MESUAL puede pisar |
| Zonas clientes | Asignación rápida | Maestra al correr ciclo |

Para no pisar metas armadas en Admin, no re-subas la hoja METAS del Excel salvo que quieras reemplazar.

## Acceso

- Navbar **Admin**
- Botón en **Gerencia**
