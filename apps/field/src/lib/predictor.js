/**
 * BLACK SHEEP — Sistema predictivo de 7 días
 *
 * Responde: ¿Qué probablemente va a pasar esta semana?
 * Usa: ciclo de reposición, estado de riesgo, historial MTD, focos.
 * No necesita ML externo — usa los datos que ya tenemos.
 */

const n = v => Number(v) || 0
const money = v => v > 0 ? '$' + Math.round(v).toLocaleString('es-CL') : null

/**
 * Predicción de venta para los próximos 7 días basada en:
 * 1. Clientes cuyo ciclo de reposición vence en los próximos 7 días
 * 2. Clientes en riesgo recuperables con historial
 * 3. Ritmo actual vs meta
 */
export function predict7Days(cartera = [], meta = null, focos = []) {
  const diasRestantes = 7
  const hoy = new Date()

  let ventaEsperada  = 0
  let ventaEnRiesgo  = 0
  let oportunidad    = 0
  const clientesPorVencer  = []
  const clientesEnRiesgo   = []
  const clientesRecuperables = []

  for (const c of cartera) {
    const dias     = n(c.dias_sin_comprar)
    const ciclo    = n(c.ciclo_dias)
    const venta    = n(c.venta_mensual) || n(c.venta_mtd)
    const estado   = String(c.estado_fuga || '').toUpperCase()
    const nombre   = c.nombre_cliente || c.cliente_key
    if (!venta || venta <= 0) continue
    if (c.es_bloqueado) continue

    // Ciclo por vencer en 7 días
    if (ciclo > 0 && dias >= 0 && dias < 180) {
      const diasParaVencer = ciclo - dias
      if (diasParaVencer >= 0 && diasParaVencer <= diasRestantes) {
        const valorEsp = Math.round(venta * 0.9)
        ventaEsperada += valorEsp
        clientesPorVencer.push({ nombre, dias, ciclo, valorEsp, diasParaVencer })
      }
    }

    // Riesgo recuperable (30-90 días, no muerto)
    if (/RIESGO|ENFRI/.test(estado) && dias >= 20 && dias <= 90) {
      const valorRiesgo = Math.round(venta * 0.35)
      ventaEnRiesgo += valorRiesgo
      clientesEnRiesgo.push({ nombre, dias, valorRiesgo, estado })
    }

    // Recuperables: entre 15-30 días, buen historial
    if (dias >= 15 && dias <= 30 && venta >= 100000 && !/RIESGO|ENFRI|DORMIDO/.test(estado)) {
      const valorOp = Math.round(venta * 0.4)
      oportunidad += valorOp
      clientesRecuperables.push({ nombre, dias, valorOp })
    }
  }

  // Proyección de cierre de mes
  const vtaMtd = cartera.reduce((a, c) => a + n(c.venta_mtd), 0)
  const metaMensual = n(meta?.meta_mensual)
  const fechaMes = hoy
  const diasMes  = new Date(fechaMes.getFullYear(), fechaMes.getMonth() + 1, 0).getDate()
  const diasPasados = fechaMes.getDate()
  const diasRestantesMes = diasMes - diasPasados
  const ritmoActual = diasPasados > 0 ? vtaMtd / diasPasados : 0
  const proyeccionCierre = vtaMtd + ritmoActual * diasRestantesMes

  // Focos atrasados
  const focosEnRiesgo = focos.filter(f => {
    const sold = n(f.vendido_unidad); const goal = n(f.meta_unidad)
    if (!goal) return false
    return (sold / goal) < (diasPasados / diasMes * 0.75)
  }).map(f => ({
    nombre: f.foco,
    pct: Math.round((n(f.vendido_unidad) / n(f.meta_unidad)) * 100),
    falta: Math.max(0, n(f.meta_unidad) - n(f.vendido_unidad)),
    unidad: f.unidad_meta || 'u',
  }))

  return {
    ventaEsperada: Math.round(ventaEsperada),
    ventaEnRiesgo: Math.round(ventaEnRiesgo),
    oportunidad:   Math.round(oportunidad),
    totalPotencial: Math.round(ventaEsperada + oportunidad),
    proyeccionCierre: Math.round(proyeccionCierre),
    metaMensual,
    pctProyeccion: metaMensual > 0 ? Math.round(proyeccionCierre / metaMensual * 100) : null,
    clientesPorVencer:   clientesPorVencer.sort((a, b) => a.diasParaVencer - b.diasParaVencer).slice(0, 5),
    clientesEnRiesgo:    clientesEnRiesgo.sort((a, b) => b.valorRiesgo - a.valorRiesgo).slice(0, 5),
    clientesRecuperables: clientesRecuperables.sort((a, b) => b.valorOp - a.valorOp).slice(0, 5),
    focosEnRiesgo:       focosEnRiesgo.slice(0, 3),
    diasRestantesMes,
    resumen: buildResumen({ ventaEsperada, ventaEnRiesgo, oportunidad, proyeccionCierre, metaMensual, clientesPorVencer, focosEnRiesgo }),
  }
}

function buildResumen({ ventaEsperada, ventaEnRiesgo, oportunidad, proyeccionCierre, metaMensual, clientesPorVencer, focosEnRiesgo }) {
  const items = []
  if (ventaEsperada > 0) items.push(`${money(ventaEsperada)} esperados de reposición`)
  if (ventaEnRiesgo > 0) items.push(`${money(ventaEnRiesgo)} en riesgo`)
  if (oportunidad > 0)   items.push(`${money(oportunidad)} de oportunidad`)
  if (focosEnRiesgo.length) items.push(`${focosEnRiesgo.length} foco${focosEnRiesgo.length > 1 ? 's' : ''} atrasado${focosEnRiesgo.length > 1 ? 's' : ''}`)
  return items.join(' · ')
}
