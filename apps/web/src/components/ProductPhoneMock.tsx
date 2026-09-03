"use client";

export default function ProductPhoneMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative mx-auto w-full">
      {!compact && (
        <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-[40px] bg-primary/20 blur-3xl" />
      )}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0c0c] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(57,255,20,0.12)]">
        <div className="flex items-center justify-between px-4 pt-3 pb-1 text-[9px] font-semibold text-white/70">
          <span>07:45</span>
          <span className="h-1.5 w-14 rounded-full bg-white/20" />
          <span>5G · 86%</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <p className="text-[10px] font-medium text-white/50">Hoy · Mar 24</p>
            <p className="font-display text-base font-black text-white">Hola, Matías</p>
          </div>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[10px] font-black text-primary">MR</div>
        </div>
        <div className="mx-3.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
            <p className="text-[9px] font-medium tracking-wide text-white/45 uppercase">Visitas</p>
            <p className="mt-1 font-display text-lg font-black text-white">6<span className="text-white/35">/9</span></p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
            <p className="text-[9px] font-medium tracking-wide text-white/45 uppercase">Venta del día</p>
            <p className="mt-1 font-display text-lg font-black text-primary">$4,2M</p>
          </div>
        </div>
        <div className="mx-3.5 mt-2.5 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/15 to-transparent p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary px-2 py-0.5 text-[8px] font-black tracking-wide text-black uppercase">Foco</span>
            <span className="text-[9px] text-white/50">09:20</span>
          </div>
          <p className="mt-1.5 text-xs font-bold text-white">Reponer stock crítico</p>
          <p className="mt-0.5 text-[10px] text-white/55">Central Providencia · SKU 0884</p>
        </div>
        {!compact && (
          <div className="mx-3.5 mt-2.5 mb-4 space-y-1.5">
            {[
              { t: "11:05", n: "Botillería San Miguel", s: "Confirmado", c: "text-primary bg-primary/12" },
              { t: "13:40", n: "Panadería Central", s: "En ruta", c: "text-sky-400 bg-sky-400/12" },
              { t: "15:15", n: "Almacén El Trébol", s: "Pendiente", c: "text-white/50 bg-white/8" },
            ].map((r) => (
              <div key={r.n} className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <span className="w-8 text-[9px] font-bold text-white/40">{r.t}</span>
                <span className="flex-1 truncate text-[10px] font-semibold text-white/90">{r.n}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${r.c}`}>{r.s}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-center pb-2 pt-1"><div className="h-1 w-20 rounded-full bg-white/25" /></div>
      </div>
    </div>
  );
}
