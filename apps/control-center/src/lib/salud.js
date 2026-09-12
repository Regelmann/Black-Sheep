/**
 * Puntaje de salud de una empresa · 0 a 100.
 *
 * Se calcula con lo que YA devuelve `admin_empresas`: no hace falta una
 * migración ni un proceso nuevo. Cuatro señales, con el peso que
 * refleja cuánto duele cada una:
 *
 *   Suscripción 35 · si está cortada, nada más importa
 *   Datos       30 · sin carga reciente la app muestra el mes pasado
 *   Uso         20 · sin usuarios nadie la está usando
 *   Actividad   15 · con clientes pero sin venta, algo se rompió
 *
 * Los cortes (80 bueno, 60 atención) viven en packages/ui/Salud: acá
 * sólo se calcula el número.
 */
export function saludEmpresa(e) {
  const dias = e.ultima_carga
    ? Math.floor((Date.now() - new Date(e.ultima_carga)) / 86400000)
    : null

  const suscripcion = !e.habilitado ? 0
    : e.estado === 'morosa' ? 18
    : Number(e.dias_restantes) < 7 ? 26
    : 35

  const datos = dias === null ? 0
    : dias <= 2 ? 30
    : dias <= 7 ? 22
    : dias <= 30 ? 10
    : 0

  const uso = Number(e.usuarios) >= 3 ? 20 : Number(e.usuarios) > 0 ? 12 : 0

  const actividad = Number(e.venta_mtd) > 0 ? 15
    : Number(e.clientes) > 0 ? 6 : 0

  return {
    puntaje: suscripcion + datos + uso + actividad,
    senales: [
      { nombre: 'Suscripción', ok: suscripcion >= 26 },
      { nombre: 'Datos al día', ok: datos >= 22 },
      { nombre: 'Usuarios', ok: uso >= 12 },
      { nombre: 'Actividad', ok: actividad >= 15 },
    ],
    diasSinCarga: dias,
  }
}

/** Lo que hay que hacer hoy, ordenado por urgencia real. */
export function focosPlataforma(empresas) {
  const focos = []
  const cortadas = empresas.filter((e) => !e.habilitado && e.estado)
  const morosas = empresas.filter((e) => e.estado === 'morosa' && e.habilitado)
  const sinCargar = empresas.filter((e) => e.habilitado && !e.ultima_carga)
  const porVencer = empresas.filter(
    (e) => e.habilitado && e.estado !== 'morosa' && Number(e.dias_restantes) <= 7)

  if (cortadas.length) focos.push({
    severidad: 'critico',
    titulo: `${cortadas.length} ${cortadas.length === 1 ? 'empresa cortada' : 'empresas cortadas'}`,
    detalle: 'Sus vendedores no ven datos. Nada se borró: vuelve al registrar el pago.',
    impacto: cortadas.map((e) => e.empresa).join(' · '),
    accion: 'Ver cobranza', ruta: '/cobranza',
  })

  if (morosas.length) focos.push({
    severidad: 'aviso',
    titulo: `${morosas.length} en período de gracia`,
    detalle: 'Siguen operando, pero el reloj corre.',
    impacto: morosas.map((e) => e.empresa).join(' · '),
    accion: 'Ver cobranza', ruta: '/cobranza',
  })

  // Una empresa que nunca cargó es una venta que se está enfriando: no
  // llegó a ver el producto funcionando con sus datos.
  if (sinCargar.length) focos.push({
    severidad: 'aviso',
    titulo: `${sinCargar.length} sin cargar datos`,
    detalle: 'Todavía no vieron el producto con sus propios números.',
    impacto: sinCargar.map((e) => e.empresa).join(' · '),
    accion: 'Ver empresas', ruta: '/empresas',
  })

  if (porVencer.length) focos.push({
    severidad: 'aviso',
    titulo: `${porVencer.length} ${porVencer.length === 1 ? 'vence' : 'vencen'} esta semana`,
    detalle: 'Llamar antes de que haya que cortar.',
    impacto: porVencer.map((e) => `${e.empresa} · ${e.dias_restantes}d`).join(' · '),
    accion: 'Ver cobranza', ruta: '/cobranza',
  })

  return focos
}
