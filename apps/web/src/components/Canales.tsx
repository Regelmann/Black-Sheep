"use client";

const CANALES = [
  { tag: "Terreno", body: "Ruta · visitas · oportunidades · pedidos" },
  { tag: "KAM", body: "Cuentas · negociación · recurrencia · crecimiento" },
  { tag: "Televenta", body: "Contactos · pedidos · recuperación · venta" },
];

export default function Canales() {
  return (
    <section className="relative border-y border-white/[0.06] bg-[#050505] px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary uppercase">Canales</p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
            Tres canales.
            <span className="block text-primary">Una sola verdad para gerencia.</span>
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {CANALES.map((c) => (
            <div key={c.tag} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
              <p className="font-display text-lg font-black text-white">{c.tag}</p>
              <p className="mt-2 text-xs leading-relaxed text-ink">{c.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm font-bold text-primary">Gerencia: todo en un solo lugar.</p>
      </div>
    </section>
  );
}
