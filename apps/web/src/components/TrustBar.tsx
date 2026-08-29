const INDUSTRIES = [
  "Distribuidoras de alimentos",
  "Bebidas y licores",
  "Ferreterías",
  "Agroinsumos",
  "Cosmética y cuidado",
  "Farmacias independientes",
  "Panadería B2B",
  "Horeca",
  "Insumos de mascotas",
];

export default function TrustBar() {
  return (
    <section className="relative border-y border-line/40 bg-navy-deep/60 py-8">
      <p className="mb-6 text-center font-display text-[11px] font-bold tracking-[0.28em] text-ink/60 uppercase">
        Operando en terreno desde Arica a Punta Arenas
      </p>
      <div className="mask-marquee relative overflow-hidden">
        <div className="animate-marquee flex w-max items-center gap-10 pr-10">
          {[...INDUSTRIES, ...INDUSTRIES].map((item, i) => (
            <span
              key={`${item}-${i}`}
              aria-hidden={i >= INDUSTRIES.length}
              className="flex items-center gap-10 whitespace-nowrap"
            >
              <span className="font-display text-sm font-semibold text-ink/70">
                {item}
              </span>
              <span className="h-1 w-1 rounded-full bg-primary/70" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
