"use client";

const PRODUCTOS = [
  { grupo: "REPOSICIÓN", nombre: "Pechuga de pollo 10 kg", precio: "$7.990" },
  { grupo: "REPOSICIÓN", nombre: "Salsa Cheddar 1 kg", precio: "$4.990" },
  { grupo: "OFERTAS PARA TI", nombre: "Salsa BBQ 3,6 L", precio: "$3.990" },
  { grupo: "OFERTAS PARA TI", nombre: "Ketchup 5 kg", precio: "$3.490" },
];

export default function CatalogoProtagonista() {
  return (
    <section className="relative border-y border-white/[0.06] bg-[#050505] px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary uppercase">Cliente</p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
            Cada cliente tiene
            <span className="block text-primary">su propio Black Sheep.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink sm:text-base">
            No es un catálogo genérico con descuentos al voleo: cada cuenta ve
            sus productos, su precio acordado, su stock y su historial de
            recompra — sin tener que llamar al vendedor para saber cuánto paga.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-bold text-primary">Precio acordado</span>
            <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-white/70">Tu precio</span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-br from-[#121212] to-[#0a0a0a] p-5 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)]">
          <p className="text-xs font-bold text-white/50">Hola, Restaurante Central</p>
          <p className="mt-1 font-display text-sm font-black text-white">Tus productos</p>
          <div className="mt-4 space-y-3">
            {["REPOSICIÓN", "OFERTAS PARA TI"].map((grupo) => (
              <div key={grupo}>
                <p className="text-[9px] font-bold tracking-[0.14em] text-primary/80 uppercase">{grupo}</p>
                <div className="mt-1.5 space-y-1.5">
                  {PRODUCTOS.filter((p) => p.grupo === grupo).map((p) => (
                    <div key={p.nombre} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                      <span className="text-xs text-white/85">{p.nombre}</span>
                      <span className="text-xs font-bold text-primary">{p.precio}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <button className="rounded-full border border-white/15 px-4 py-1.5 text-[11px] font-bold text-white/80">
              Ver catálogo completo
            </button>
            <span className="text-[11px] font-bold text-white/50">🛒 8 productos</span>
          </div>
        </div>
      </div>
    </section>
  );
}
