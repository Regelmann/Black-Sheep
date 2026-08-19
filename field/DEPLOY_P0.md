# P0 — Deploy Vercel + Pedidos/Notas

## 1) Supabase (una vez)
SQL Editor → pegar y Run:
`scripts/SUPABASE_P0_PEDIDOS_NOTAS.sql`

Verificá:
```sql
select column_name from information_schema.columns
where table_name = 'pedidos' order by 1;
-- debe incluir: cliente_key, lineas, nota, ejecutivo_id, creado_en
```

## 2) GitHub / Vercel
1. Subí este repo a `main` (archivos en la **raíz**, no carpeta anidada).
2. Vercel Project Settings:
   - **Node.js Version: 24.x**
   - Install: `npm install --legacy-peer-deps` (ya en vercel.json)
3. Env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
4. Redeploy.

## 3) Probar en el teléfono
1. Hard refresh (o borrar caché del sitio).
2. Ruta → bloque **PEDIDOS DE HOY**.
3. Cliente → **Pedido en terreno** → agregar líneas → **Guardar**.
4. Debe desaparecer el error de `cliente_key` y aparecer el pedido en la lista.
5. **Nota** → guardar → sin scroll al fondo raro (sheet modal).

## Si el build falla en Vercel
- Confirmá `engines.node = 24.x` en package.json
- Confirmá que no hay `engines: 20.x` sobrescribiendo
- Logs: si dice `vite: command not found`, el `npm install` falló → mirá peer deps / Node version
