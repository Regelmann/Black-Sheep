const riskWeight={critico:40,crítico:40,alto:30,medio:18,bajo:8}
const num=v=>Number(v||0)
export const commercialPriorityRepo={
 score({client,opportunities=[]}){
  const risk=String(client?.riesgo||'').toLowerCase()
  const riskScore=riskWeight[risk]||0
  const days=num(client?.dias_sin_comprar??client?.diasSinComprar)
  const inactivity=Math.min(25,Math.max(0,days-14)*0.55)
  const variation=num(client?.variacion??client?.variacion_mtd)
  const decline=variation<0?Math.min(15,Math.abs(variation)*20):0
  const clientOpp=opportunities.filter(o=>String(o.clienteKey)===String(client?.cliente_key||client?.clienteKey))
  const potential=clientOpp.reduce((a,o)=>a+num(o.oportunidadEstimada),0)
  const potentialScore=potential>0?Math.min(20,Math.log10(potential+1)*3):0
  const score=Math.min(100,Math.round(riskScore+inactivity+decline+potentialScore))
  let reason='Potencial comercial detectado'
  if(riskScore>=30&&potential>0)reason='Riesgo alto con oportunidad de recuperación'
  else if(potential>0&&days>=30)reason='Oportunidad de producto y baja frecuencia'
  else if(days>=30)reason='Cliente con inactividad relevante'
  else if(variation<0)reason='Caída reciente de venta'
  return {...client,clienteKey:client?.cliente_key||client?.clienteKey,nombreCliente:client?.nombre||client?.razon_social||client?.nombre_fantasia||client?.cliente_key,score,priority:score>=70?'URGENTE':score>=45?'ALTA':score>=25?'MEDIA':'BAJA',reason,potential,opportunities:clientOpp.length}
 },
 build(clients=[],opportunities=[]){return clients.map(c=>this.score({client:c,opportunities})).filter(x=>x.score>=25||x.potential>0).sort((a,b)=>b.score-a.score||b.potential-a.potential)},
 async resumen(){
  const {catalogPerformanceRepo}=await import('./repositories.js')
  const [clients,opportunities]=await Promise.all([catalogPerformanceRepo.riskQueue(),(await import('./opportunities.js')).opportunityRepo.resumen()])
  return this.build(clients,opportunities)
 }
}