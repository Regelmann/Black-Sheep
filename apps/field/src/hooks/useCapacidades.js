import { useDatos } from './useDatos.js'
import { supabase } from '../../../../packages/datos/supabase.js'

/**
 * Qué tiene contratado esta empresa. El dashboard DIBUJA según esto: una
 * capacidad apagada no es un botón deshabilitado, es una sección que no
 * existe. Una distribuidora que no mide por SKU no debería ver focos y
 * preguntarse por qué están vacíos.
 */
export function useCapacidades() {
  const { rows, loading, error } = useDatos({
    clave: ['capacidades'],
    label: 'capacidades',
    frescura: 5 * 60 * 1000,
    construir: () => supabase.from('mis_capacidades').select('codigo,nombre,descripcion,requiere,activa'),
  })
  const mapa = Object.fromEntries(rows.map((c) => [c.codigo, c.activa]))
  return { capacidades: rows, tiene: (c) => mapa[c] === true, loading, error }
}
