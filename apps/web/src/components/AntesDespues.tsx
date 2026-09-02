"use client";

const ANTES = ["Excel", "WhatsApp", "SAP", "Google Maps", "Planillas", "Llamadas", "Reportes"];
const DESPUES = [
  { canal: "Terreno", items: ["Ruta", "Pedido", "Visita"] },
  { canal: "Cliente", items: ["Catálogo", "Precio", "Recompra"] },
  { canal: "Gerencia", items: ["Dashboard", "Alertas", "Decisiones"] },
];

export default function AntesDespues() {
  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary uppercase">Antes / Después</p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
            7 herramientas fragmentadas.
            <span className="block text-primary">Una operación conectada.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2 md:items-center">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <p className="text-[10px] font-bold tracking-[0.18em] text-white/40 uppercase">Antes</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {ANTES.map((a) => (
                <span key={a} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60">{a}</span>
              ))}
            </div>
            <p className="mt-4 text-xs text-white/35">7 herramientas · información fragmentada</p>
          </div>

          <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-6">
            <p className="text-[10px] font-bold tracking-[0.18em] text-primary uppercase">Con Black Sheep</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {DESPUES.map((c) => (
                <div key={c.canal}>
                  <p className="text-[10px] font-black text-white">{c.canal}</p>
                  <ul className="mt-1.5 space-y-1">
                    {c.items.map((it) => (
                      <li key={it} className="text-[10px] text-white/60">{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs font-bold text-primary">Una operación conectada.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
