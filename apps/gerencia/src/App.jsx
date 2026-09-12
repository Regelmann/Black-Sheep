import { Navigate, Route, Routes } from 'react-router-dom'
import { Armazon } from '../../../packages/ui/Armazon.jsx'
import { useSesion } from './hooks/useSesion.jsx'
import { VERSION, selloCorto } from '../../../packages/datos/version.js'
import { useCapacidades } from './hooks/useCapacidades.js'
import { useDatos } from './hooks/useDatos.js'
import { supabase } from '../../../packages/datos/supabase.js'
import Entrar from './paginas/Entrar.jsx'
import Resumen from './paginas/Resumen.jsx'
import Carga from './paginas/Carga.jsx'
import Conflictos from './paginas/Conflictos.jsx'
import Datos from './paginas/Datos.jsx'
import Equipo from './paginas/Equipo.jsx'

/**
 * La navegación se dibuja desde las CAPACIDADES de la empresa, no desde
 * una lista fija. Una distribuidora que no mide por SKU no ve "Focos";
 * no es un botón deshabilitado, sencillamente no existe para ella.
 */
export default function App() {
  const { sesion, cargando, esSuperadmin, email, salir } = useSesion()
  const cap = useCapacidades()

  const conflictos = useDatos({
    clave: ['conflictos', 'conteo'],
    construir: () => supabase.from('conflictos').select('id'),
    label: 'conflictos',
    activa: !!sesion,
  })

  if (cargando) return <p className="estado">Cargando…</p>
  if (!sesion) return <Entrar />

  const pendientes = conflictos.rows?.length || 0

  // Misma estructura que el Control Center, distintos módulos. El
  // componente es uno solo: si mañana cambia la barra, cambia en las dos.
  const secciones = [
    { to: '/', texto: 'Resumen', icono: 'hoy', fin: true },
    { grupo: 'Operación', items: [
      { to: '/carga', texto: 'Cargar datos', icono: 'carga' },
      { to: '/conflictos', texto: 'Conflictos', icono: 'alerta', pin: pendientes },
    ] },
    { grupo: 'Administrar', items: [
      { to: '/datos', texto: 'Clientes y productos', icono: 'clientes' },
      { to: '/equipo', texto: 'Equipo y metas', icono: 'usuarios' },
    ] },
  ]

  return (
    <Armazon marca="gerencia" secciones={secciones} usuario={email}
             onSalir={salir} sello={selloCorto()}>
      <Routes>
        <Route path="/" element={<Resumen />} />
        <Route path="/carga" element={<Carga />} />
        <Route path="/conflictos" element={<Conflictos />} />
        <Route path="/datos" element={<Datos cap={cap} />} />
        <Route path="/equipo" element={<Equipo cap={cap} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Armazon>
  )
}
