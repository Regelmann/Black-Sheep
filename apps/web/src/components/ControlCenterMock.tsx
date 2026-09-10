"use client";

const EJECUTIVOS = [
  { n: "Juan", pct: 92, dir: "up" },
  { n: "Pedro", pct: 84, dir: "flat" },
  { n: "María", pct: 71, dir: "down" },
];

const ARROW: Record<string, string> = { up: "↑", down: "↓", flat: "→" };
const COLOR: Record<string, string> = {
  up: "text-primary",
  down: "text-rose-400",
  flat: "text-white/50",
};

export default function ControlCenterMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold tracking-[0.18em] text-white/40 uppercase">Control Center</p>
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-medium text-white/45 uppercase">Venta compañía</p>
          <p className="font-display text-xl font-black text-white">$275,4M</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-medium text-white/45 uppercase">Meta</p>
          <p className="text-xs font-bold text-white/70">$320M</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-primary" style={{ width: "86%" }} />
      </div>
      <p className="mt-1 text-right text-[9px] font-bold text-primary">86%</p>

      {!compact && (
        <>
          <div className="mt-3 border-t border-white/[0.06] pt-2.5">
            <p className="text-[9px] font-bold tracking-[0.18em] text-white/40 uppercase">Ejecutivos</p>
            <div className="mt-1.5 space-y-1">
              {EJECUTIVOS.map((e) => (
                <div key={e.n} className="flex items-center justify-between text-[10px]">
                  <span className="text-white/75">{e.n}</span>
                  <span className={`font-bold ${COLOR[e.dir]}`}>{e.pct}% {ARROW[e.dir]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-2.5">
            {[
              "12 clientes perdiendo ritmo",
              "8 productos bajo cobertura",
              "4 ejecutivos bajo meta",
            ].map((a) => (
              <div key={a} className="flex items-center gap-1.5 text-[9px] text-amber-300/90">
                <span>⚠</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
