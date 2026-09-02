"use client";

export default function ProductPhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-[40px] bg-primary/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0c0c0c] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(57,255,20,0.12)]">
        <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[10px] font-semibold text-white/70">
          <span>07:45</span>
          <span className="h-1.5 w-16 rounded-full bg-white/20" />
          <span>5G · 86%</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] font-medium text-white/50">Hoy · Mar 24</p>
            <p className="font-display text-lg font-black text-white">Hola, Matías</p>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-xs font-black text-primary">MR</div>
        </div>
        <div className="mx-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[10px] font-medium tracking-wide text-white/45 uppercase">Visitas</p>
            <p className="mt-1 font-display text-2xl font-black text-white">6<span className="text-white/35">/9</span></p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[10px] font-medium tracking-wide text-white/45 uppercase">Venta del día</p>
            <p className="mt-1 font-display text-2xl font-black text-primary">$4,2M</p>
          </div>
        </div>
        <div className="mx-4 mt-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 to-transparent p-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-black tracking-wide text-black uppercase">Foco prioritario</span>
            <span className="text-[10px] text-white/50">09:20</span>
          </div>
          <p className="mt-2 text-sm font-bold text-white">Reponer stock crítico</p>
          <p className="mt-0.5 text-[11px] text-white/55">Central Providencia · SKU 0884</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-primary">Iniciar visita →</span>
            <span className="text-[10px] text-white/40">1,2 km</span>
          </div>
        </div>
        <div className="mx-4 mt-3 mb-5 space-y-2">
          {[
            { t: "11:05", n: "Botillería San Miguel", s: "Confirmado", c: "text-primary bg-primary/12" },
            { t: "13:40", n: "Panadería Central", s: "En ruta", c: "text-sky-400 bg-sky-400/12" },
            { t: "15:15", n: "Almacén El Trébol", s: "Pendiente", c: "text-white/50 bg-white/8" },
          ].map((r) => (
            <div key={r.n} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <span className="w-10 text-[10px] font-bold text-white/40">{r.t}</span>
              <span className="flex-1 truncate text-xs font-semibold text-white/90">{r.n}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${r.c}`}>{r.s}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-center pb-2"><div className="h-1 w-24 rounded-full bg-white/25" /></div>
      </div>
      <div className="absolute -left-3 top-24 hidden rounded-xl border border-white/10 bg-black/90 px-3 py-2 shadow-xl sm:block">
        <p className="text-[10px] font-bold text-primary">Offline-first</p>
        <p className="text-[9px] text-white/50">Sin señal, sin drama</p>
      </div>
      <div className="absolute -right-2 bottom-28 hidden rounded-xl border border-white/10 bg-black/90 px-3 py-2 shadow-xl sm:block">
        <p className="text-[10px] font-bold text-white">Precio cliente</p>
        <p className="text-[9px] text-white/50">Lista + acuerdo</p>
      </div>
    </div>
  );
}
