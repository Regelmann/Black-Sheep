export function uniqueValues(rows = [], keys = []) {
  return [...new Set(rows.map(row => keys.map(k => row?.[k]).find(v => v != null)).filter(Boolean))]
}

export function filterRows(rows = [], { canal = 'all', zona = 'all', ejecutivoId = 'all' } = {}) {
  return rows.filter(row => {
    const rowCanal = row?.canal ?? row?.canal_nombre ?? row?.tipo_canal
    const rowZona = row?.zona ?? row?.zona_nombre
    const rowEjecutivo = row?.ejecutivo_id ?? row?.id_ejecutivo
    return (canal === 'all' || rowCanal === canal)
      && (zona === 'all' || rowZona === zona)
      && (ejecutivoId === 'all' || String(rowEjecutivo) === String(ejecutivoId))
  })
}
