import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../../packages/datos/supabase.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { ClienteFila } from '../componentes/Piezas.jsx'

const FILTROS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'activo', texto: 'Al día' },
  { id: 'cayendo', texto: 'Cayendo' },
  { id: 'dormido', texto: 'Dormidos' },
]

export default function Cartera() {
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')

  const datos = useDatos({
    clave: ['mi_cartera', filtro, busca],
    label: 'tu cartera',
    construir: () => {
      let q = supabase.from('mi_cartera').select(
        'cliente_key,nombre,comuna,estado,dias_sin_comprar,venta_mtd,promedio_3m,brecha,es_bloqueado',
      ).order('promedio_3m', { ascending: false, nullsFirst: false }).limit(80)
      if (filtro === 'activo') q = q.eq('estado', 'activo')
      if (filtro === 'dormido') q = q.in('estado', ['dormido', 'fugado'])
      if (filtro === 'cayendo') q = q.lt('brecha', 0)
      if (busca.trim()) q = q.ilike('nombre', `%${busca.trim()}%`)
      return q
    },
  })

  return (
    <div className="hoja">
      <div className="campo">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
               placeholder="Buscar cliente" inputMode="search" />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTROS.map((f) => (
          <button key={f.id}
                  className={`boton${filtro === f.id ? ' principal' : ''}`}
                  style={{ minHeight: 40, whiteSpace: 'nowrap' }}
                  onClick={() => setFiltro(f.id)}>
            {f.texto}
          </button>
        ))}
      </div>

      <Bloque datos={datos} que="tu cartera" vacio="No hay clientes que coincidan.">
        {datos.rows?.map((c) => (
          <Link key={c.cliente_key} to={`/cliente/${encodeURIComponent(c.cliente_key)}`}>
            <ClienteFila c={c} pie={c.comuna} />
          </Link>
        ))}
      </Bloque>
    </div>
  )
}
