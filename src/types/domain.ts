/**
 * Domain types — KeyFoods Field Sales
 * Single source of truth for Action Queue + consistent metrics
 */

export type ActionType =
  | 'reponer'
  | 'riesgo'
  | 'enfriandose'
  | 'nuevo'
  | 'pedido'
  | 'visita'

export type ActionTone = 'bad' | 'warn' | 'ok' | 'muted'

export interface SkuReponer {
  nombre: string
  diasUltima: number | null
  cicloEst: number | null
  label: string
  tone: ActionTone
  promClp?: number
}

export interface Client {
  id?: string
  cliente_key: string
  nombre_cliente?: string | null
  razon_social?: string | null
  comuna?: string | null
  direccion?: string | null
  telefono?: string | null
  link_whatsapp?: string | null
  estado_fuga?: string | null
  venta_mtd?: number | null
  venta_mensual?: number | null
  venta_historica?: number | null
  dias_sin_comprar?: number | null
  oferta_real?: string | null
  sku_detalle?: string | null
  es_nuevo_mes?: boolean | number | string | null
  fecha_snapshot?: string | null
  ultima_compra?: string | null
  lat?: number | null
  lng?: number | null
  es_bloqueado?: boolean | null
  ejecutivo_id?: string | null
}

export interface MetaRow {
  meta_mensual?: number | null
  mes?: string | null
  fecha_snapshot?: string | null
  ejecutivo_id?: string | null
}

export interface ActionItem {
  id: string
  type: ActionType
  /** Higher = more urgent. Typical range 40–150. */
  priority: number
  title: string
  subtitle?: string
  count?: number
  amount?: number
  clientId?: string
  ctaLabel: string
  oferta?: string | null
  telefono?: string | null
  whatsapp?: string | null
  /** Optional: raw client for advanced handlers */
  raw?: Client
}

export interface ConsistentMetrics {
  ventaMtd: number
  metaMensual: number
  pct: number
  brecha: number
  ritmoDia: number
  proyeccion: number
  proyeccionDiff: number
  reponerHoy: number
  reponerList: Client[]
  nRiesgo: number
  nEnfri: number
  nActivos: number
  nNuevos: number
  ventaRiesgo: number
  actionQueue: ActionItem[]
  totalClientes: number
}

export type ClientAction =
  | 'call'
  | 'whatsapp'
  | 'navigate'
  | 'note'
  | 'block'
  | 'unblock'
  | 'visit'
  | 'pedido'
