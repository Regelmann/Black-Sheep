/**
 * DATOS DE DEMOSTRACIÓN — sólo para revisar la UI sin backend.
 *
 * Se activa con VITE_DEMO=1 y NUNCA entra al bundle de producción: main.jsx
 * lo carga con import() dinámico dentro de un `if`, así que Rollup lo elimina
 * por completo cuando la bandera está apagada.
 *
 * Existe porque juzgar un rediseño sobre pantallas vacías es imposible: hay
 * que ver densidad real, nombres largos, montos de verdad y estados mezclados.
 */

const HOY = new Date().toISOString().slice(0, 10)

/** Fecha a N días atrás, en ISO corto. Se usa para que los ciclos de
 *  reposición caigan donde queremos y no dependan del día en que se abra
 *  la demo. */
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/* [key, nombre, dirección, comuna, estado, ventaHistórica, lat, lng,
    ventaMtd, díasSinComprar, esNuevoDelMes] */
const CLIENTES = [
  ['ALM-1042', 'Almacén Doña Rosa', 'Av. Comercio 1420', 'Pichilemu', 'FIEL', 890000, -34.3868, -72.0011, 742000, 4, false],
  ['MIN-2277', 'Minimarket El Faro', 'Costanera 340', 'Pichilemu', 'RIESGO', 1240000, -34.3921, -72.0135, 386000, 21, false],
  ['BOD-3391', 'Bodegón Santa Elena', 'Los Aromos 88', 'Cardenal Caro', 'FUGA', 430000, -34.4102, -71.9887, 0, 63, false],
  ['SUP-4410', 'Supermercado La Estrella', 'Ruta I-50 km 3', 'Litueche', 'FIEL', 2310000, -34.1198, -71.7302, 2145000, 2, false],
  ['ALM-5523', 'Almacén Los Nogales', 'Pasaje Uno 12', 'Marchigüe', 'NUEVO', 180000, -34.3990, -71.6210, 164000, 9, true],
  ['MIN-6634', 'Minimarket Puerto Viejo', 'Muelle Sur s/n', 'Pichilemu', 'RIESGO', 760000, -34.3805, -72.0208, 231000, 31, false],
  ['DIS-7745', 'Distribuidora Hermanos Paz', 'Industrial 2200', 'San Fernando', 'FIEL', 3450000, -34.5855, -70.9890, 3120000, 1, false],
  ['ALM-8856', 'Almacén La Esquina Feliz', 'Balmaceda 455', 'Pichilemu', 'FUGA', 295000, -34.3877, -72.0044, 0, 78, false],
]

/** Detalle de SKU por cliente. `skusAReponer` compara los días desde la
 *  última compra contra el ciclo estimado: si el ciclo está vencido, el
 *  cliente entra en REPONER. Sin esta columna el KPI queda en 0. */
const SKU_DETALLE = (dias) => [
  { nombre: 'Arroz Grado 2 · 1kg',  promUd: 24, udMtd: 6,  promClp: 1290, clpMtd: 7740,  ultima: haceDias(dias),     cicloDias: 14, nCompras: 9 },
  { nombre: 'Aceite Maravilla 900ml', promUd: 12, udMtd: 2, promClp: 2190, clpMtd: 4380,  ultima: haceDias(dias + 3), cicloDias: 12, nCompras: 7 },
  { nombre: 'Fideos Spaghetti 400g', promUd: 30, udMtd: 18, promClp: 890,  clpMtd: 16020, ultima: haceDias(dias),     cicloDias: 21, nCompras: 11 },
]

const cliente = (c, i) => ({
  id: `cli-${i}`,
  cliente_key: c[0],
  punto_id_bq: c[0],
  nombre_cliente: c[1],
  razon_social: c[1],
  nombre_local: c[1],
  direccion: c[2],
  comuna: c[3],
  estado_fuga: c[4],
  segmento: c[4],
  venta_mensual: c[5],
  // Sin venta_historica, esNuevoMes() da por nuevo a todo el mundo
  // (rama "sin historial relevante") y NUEVOS marcaba 6 de 8 clientes.
  venta_historica: c[10] ? 0 : c[5] * 11,
  potencial: c[5],
  lat: c[6],
  lng: c[7],
  // venta_mtd es LA columna que lee metrics.js para la venta del mes.
  // Antes sólo existía venta_mensual y el panel mostraba $0.
  venta_mtd: c[8],
  dias_sin_comprar: c[9],
  es_nuevo_mes: c[10],
  primera_compra: c[10] ? haceDias(c[9]) : '2024-03-11',
  sku_detalle: SKU_DETALLE(c[9]),
  telefono: '+56 9 8123 4567',
  persona_contacto: 'Rosa Méndez',
  es_bloqueado: false,
  ultima_compra: haceDias(c[9]),
  fecha_ultima_compra: haceDias(c[9]),
  oferta_real: 'Arroz G2 · Aceite 900ml · Fideos',
  zona: 'Costa',
})

const CARTERA = CLIENTES.map(cliente)

const VISITAS = CARTERA.slice(0, 6).map((c, i) => ({
  id: `vis-${i}`,
  ruta_id: 'ruta-hoy',
  orden: i + 1,
  cliente_key: c.cliente_key,
  punto_id_bq: c.cliente_key,
  nombre_local: c.nombre_cliente,
  direccion: c.direccion,
  comuna: c.comuna,
  lat: c.lat,
  lng: c.lng,
  segmento: c.segmento,
  potencial: c.venta_mensual,
  oferta: c.oferta_real,
  estado: ['visitada', 'visitada', 'pendiente', 'pendiente', 'omitida', 'pendiente'][i],
  resultado: i < 2 ? 'pedido' : null,
  fecha: HOY,
}))

const PRODUCTOS = [
  ['ARZ-G2-1K', 'Arroz Grado 2 · 1 kg', 1290, 'Abarrotes'],
  ['ACE-900', 'Aceite Vegetal · 900 ml', 2190, 'Abarrotes'],
  ['FID-SPA-400', 'Fideos Spaghetti · 400 g', 890, 'Abarrotes'],
  ['AZU-1K', 'Azúcar Granulada · 1 kg', 1150, 'Abarrotes'],
  ['HAR-1K', 'Harina sin Polvos · 1 kg', 980, 'Abarrotes'],
  ['LEC-1L', 'Leche Entera · 1 L', 1090, 'Lácteos'],
  ['DET-3L', 'Detergente Líquido · 3 L', 4590, 'Limpieza'],
  ['PAP-12', 'Papel Higiénico · 12 un', 5290, 'Limpieza'],
]

const TABLAS = {
  cartera: CARTERA,
  gerencia_clientes: CARTERA.map(c => ({ ...c, ejecutivo: 'Costa' })),
  visitas: VISITAS,
  rutas: [{ id: 'ruta-hoy', fecha: HOY, ejecutivo_id: 'demo-user', estado: 'en_curso' }],
  checkins: [],
  notas_cliente: CARTERA.slice(0, 3).map((c, i) => ({
    id: `nota-${i}`,
    cliente_key: c.cliente_key,
    nombre_local: c.nombre_cliente,
    tipo: 'resultado_visita',
    texto: 'Resultado: pedido · Pedido capturado',
    creado_en: '2026-08-26T14:20:00Z',
    ejecutivo_id: 'demo-user',
  })),
  productos: PRODUCTOS.map((p, i) => ({
    id: `prd-${i}`, sku_canon: p[0], nombre: p[1], producto_nombre: p[1],
    precio_lista: p[2], precio: p[2], categoria: p[3], stock: 40 - i * 3, activo: true,
  })),
  precios: PRODUCTOS.map((p, i) => ({
    id: `pre-${i}`, sku_canon: p[0], producto_nombre: p[1], precio_lista: p[2],
    precio_cliente: Math.round(p[2] * 0.93), cliente_key: 'ALM-1042',
  })),
  pedidos: [
    { id: 'ped-1', cliente_key: 'ALM-1042', nombre_local: 'Almacén Doña Rosa', total: 148900, estado: 'confirmado', creado_en: '2026-08-27T10:12:00Z', ejecutivo_id: 'demo-user' },
    { id: 'ped-2', cliente_key: 'SUP-4410', nombre_local: 'Supermercado La Estrella', total: 512300, estado: 'enviado', creado_en: '2026-08-26T16:40:00Z', ejecutivo_id: 'demo-user' },
    { id: 'ped-3', cliente_key: 'DIS-7745', nombre_local: 'Distribuidora Hermanos Paz', total: 987450, estado: 'confirmado', creado_en: '2026-08-25T09:05:00Z', ejecutivo_id: 'demo-user' },
  ],
  pedido_lineas: [],
  prospectos: [
    { id: 'pro-1', cliente_key: 'PRO-9001', place_id: 'PRO-9001', nombre_cliente: 'Botillería El Encuentro', nombre_local: 'Botillería El Encuentro', direccion: 'Ortúzar 210', comuna: 'Pichilemu', lat: -34.3890, lng: -72.0060, estado: 'nuevo' },
    { id: 'pro-2', cliente_key: 'PRO-9002', place_id: 'PRO-9002', nombre_cliente: 'Panadería Santa Clara', nombre_local: 'Panadería Santa Clara', direccion: 'Errázuriz 77', comuna: 'Pichilemu', lat: -34.3931, lng: -72.0099, estado: 'contactado' },
  ],
  ejecutivos: [{ id: 'demo-user', nombre: 'Vendedor Demo', email: 'demo@blacksheep.cl', rol: 'vendedor', zona: 'Costa' }],
  // meta_mensual es el nombre que lee computeConsistentMetrics. Con
  // "objetivo" a secas el hero mostraba "Meta $0" y se contradecía solo.
  metas: [{
    id: 'meta-1',
    ejecutivo_id: 'demo-user',
    mes: new Date().toISOString().slice(0, 7),
    meta_mensual: 9000000,
    objetivo: 9000000,
    avance: 6788000,
  }],
  zonas: [{ id: 'z1', nombre: 'Costa' }, { id: 'z2', nombre: 'Valle' }],
  stock: PRODUCTOS.map((p, i) => ({ id: `st-${i}`, sku_canon: p[0], producto_nombre: p[1], cantidad: 40 - i * 3 })),
  ofertas_cliente: [],
  oferta_cliente_items: [],
  encuestas_visita: [],
  media_cliente: [],
}

/** Filtra en memoria imitando los operadores de PostgREST que usa la app. */
function aplicar(filas, filtros) {
  let out = [...filas]
  for (const f of filtros) {
    if (f.op === 'eq') out = out.filter(r => String(r[f.col]) === String(f.val))
    else if (f.op === 'neq') out = out.filter(r => String(r[f.col]) !== String(f.val))
    else if (f.op === 'in') out = out.filter(r => (f.val || []).map(String).includes(String(r[f.col])))
    else if (f.op === 'gte') out = out.filter(r => r[f.col] >= f.val)
    else if (f.op === 'lte') out = out.filter(r => r[f.col] <= f.val)
    else if (f.op === 'gt') out = out.filter(r => r[f.col] > f.val)
    else if (f.op === 'lt') out = out.filter(r => r[f.col] < f.val)
    else if (f.op === 'is') out = out.filter(r => (r[f.col] ?? null) === f.val)
    else if (f.op === 'not') out = out.filter(r => r[f.col] !== f.val)
    else if (f.op === 'ilike') {
      const pat = String(f.val).replace(/%/g, '').toLowerCase()
      out = out.filter(r => String(r[f.col] ?? '').toLowerCase().includes(pat))
    } else if (f.op === 'or') {
      const partes = String(f.val).split(',')
      out = out.filter(r => partes.some(p => {
        const m = p.match(/(\w+)\.(\w+)\.(.*)/)
        if (!m) return false
        const [, col, , val] = m
        return String(r[col] ?? '').toLowerCase().includes(String(val).replace(/%/g, '').toLowerCase())
      }))
    }
  }
  return out
}

function query(tabla) {
  const filtros = []
  let orden = null
  let limite = null
  let modo = 'select'
  let payload = null

  const api = {
    select() { return api },
    insert(rows) { modo = 'insert'; payload = rows; return api },
    update(patch) { modo = 'update'; payload = patch; return api },
    upsert(rows) { modo = 'upsert'; payload = rows; return api },
    delete() { modo = 'delete'; return api },
    order(col, o) { orden = { col, asc: o?.ascending !== false }; return api },
    limit(n) { limite = n; return api },
    range() { return api },
    single() { api._single = true; return api },
    maybeSingle() { api._single = true; return api },
    then(res, rej) { return api._run().then(res, rej) },

    async _run() {
      const base = TABLAS[tabla] || []
      if (modo !== 'select') {
        // Las escrituras se aceptan pero no persisten: la demo es para mirar,
        // y un dato mutado a medias confunde más de lo que aporta.
        const filas = Array.isArray(payload) ? payload : [payload]
        return { data: filas, error: null, count: filas.length }
      }
      let out = aplicar(base, filtros)
      if (orden) {
        out.sort((a, b) => {
          const x = a[orden.col], y = b[orden.col]
          if (x === y) return 0
          return (x > y ? 1 : -1) * (orden.asc ? 1 : -1)
        })
      }
      if (limite) out = out.slice(0, limite)
      if (api._single) return { data: out[0] ?? null, error: null }
      return { data: out, error: null, count: out.length }
    },
  }

  for (const op of ['eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt', 'is', 'not', 'ilike', 'like', 'or', 'contains']) {
    api[op] = (col, val) => {
      if (op === 'or') filtros.push({ op: 'or', val: col })
      else filtros.push({ op: op === 'like' ? 'ilike' : op, col, val })
      return api
    }
  }
  return api
}

const SESION = {
  access_token: 'demo',
  user: { id: 'demo-user', email: 'demo@blacksheep.cl', user_metadata: { nombre: 'Vendedor Demo' } },
}

export const supabaseDemo = {
  from: query,
  rpc: async () => ({ data: [], error: null }),
  auth: {
    getSession: async () => ({ data: { session: SESION }, error: null }),
    getUser: async () => ({ data: { user: SESION.user }, error: null }),
    onAuthStateChange: (cb) => {
      setTimeout(() => cb('SIGNED_IN', SESION), 0)
      return { data: { subscription: { unsubscribe() {} } } }
    },
    signInWithPassword: async () => ({ data: { session: SESION }, error: null }),
    signOut: async () => ({ error: null }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: { path: 'demo.jpg' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      list: async () => ({ data: [], error: null }),
    }),
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
}