/**
 * Plan del día compartido Hoy ↔ Mapa (misma verdad comercial).
 * sessionStorage: sobrevive navegación entre tabs; se limpia al cerrar pestaña.
 */
const KEY = 'bs_plan_dia_v1'

export function savePlanDia(plan, meta = {}) {
  if (!plan) return
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        ...plan,
        meta: {
          savedAt: new Date().toISOString(),
          ...meta,
        },
      })
    )
  } catch { void 0 }
}

export function loadPlanDia() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || !Array.isArray(p.stops)) return null
    // Caduca a las 18h
    const t = Date.parse(p.meta?.savedAt || p.generatedAt || '')
    if (!Number.isNaN(t) && Date.now() - t > 18 * 3600000) return null
    return p
  } catch {
    return null
  }
}

export function clearPlanDia() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* */
  }
}
