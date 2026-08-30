import { supabase } from '../../lib/supabase.js'
const closed=s=>!['borrador','cancelado'].includes(String(s||'').toLowerCase())
const num=v=>Number(v||0)
export const opportunityRepo={
 async cliente(clienteKey,limit=12){
  if(!clienteKey)return[]
  const key=String(clienteKey)
  const [{data:lines,error:le},{data:stock,error:se},{data:offer,error:oe}]=await Promise.all([
   supabase.from('ventas_lineas').select('sku_canon,producto_nombre,cantidad,venta_neta_clp,fecha').eq('cliente_key',key).order('fecha',{ascending:false}).limit(800),
   supabase.from('stock').select('sku_canon,producto_nombre,stock_disponible,disponible,cantidad').limit(3000),
   supabase.from('oferta_cliente_items').select('sku_canon,producto_nombre,precio,precio_cliente,activo').eq('cliente_key',key).limit(1000)
  ])
  if(le)throw le;if(se)throw se;if(oe)throw oe
  const now=Date.now();const month=30*86400000;const recent=new Map();const previous=new Map();const all=new Map();
  for(const l of lines||[]){const sku=String(l.sku_canon||l.producto_nombre||'');if(!sku)continue;const q=num(l.cantidad),sale=num(l.venta_neta_clp),d=l.fecha?new Date(l.fecha).getTime():NaN;const x=all.get(sku)||{sku,producto:l.producto_nombre||sku,qty:0,sales:0,last:null,recentQty:0,previousQty:0};x.qty+=q;x.sales+=sale;if(!x.last||(!Number.isNaN(d)&&d>x.last))x.last=d;if(!Number.isNaN(d)){if(now-d<=month)x.recentQty+=q;else if(now-d<=3*month)x.previousQty+=q}all.set(sku,x)}
  const stockMap=new Map((stock||[]).map(s=>[String(s.sku_canon||s.producto_nombre),s]));const offerMap=new Map((offer||[]).filter(o=>o.activo!==false).map(o=>[String(o.sku_canon||o.producto_nombre),o]));
  return [...all.values()].map(x=>{const s=stockMap.get(x.sku);const o=offerMap.get(x.sku);const days=x.last?Math.floor((now-x.last)/86400000):999;const avgRecent=x.previousQty/2;const gap=Math.max(0,avgRecent-x.recentQty);const available=num(s?.stock_disponible??s?.disponible??s?.cantidad);const price=num(o?.precio_cliente??o?.precio);const potential=price*gap;let reason='';let score=0;if(x.previousQty>0&&x.recentQty===0){reason='Producto habitual sin compra reciente';score+=5}else if(gap>0){reason='Frecuencia reciente bajo su histórico';score+=3}if(days>=30){reason=reason?`${reason}; última compra hace ${days} días`:`Última compra hace ${days} días`;score+=2}if(available>0){reason=reason?`${reason}; hay stock disponible`:'Hay stock disponible';score+=1}if(price>0&&gap>0)score+=1;return{sku:x.sku,producto:x.producto,compraHistorica:x.qty,ventaHistorica:x.sales,ultimaCompra:x.last?new Date(x.last).toISOString():null,diasSinCompra:days,comprasRecientes:x.recentQty,promedioBimestral:x.previousQty/2,brechaEstimada:gap,stockDisponible:available,precioCliente:price,oportunidadEstimada:potential,score,razon:reason||'Sin señal comercial suficiente'}}).filter(x=>x.score>=3&&x.brechaEstimada>0||x.score>=5).sort((a,b)=>b.oportunidadEstimada-a.oportunidadEstimada||b.score-a.score).slice(0,limit)
 }
}
