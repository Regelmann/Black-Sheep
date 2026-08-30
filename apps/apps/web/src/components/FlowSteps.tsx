import { BadgePercent, PackageCheck, Route } from "lucide-react";
import Reveal from "@/components/Reveal";

const STEPS = [
  {
    number: "01",
    tag: "Ruta",
    icon: Route,
    title: "El sistema ordena tu día",
    body: "Ordena las visitas por potencial, urgencia de reposición y kilómetros. El vendedor abre la app a las 07:45 y ya sabe a dónde ir — y por qué.",
  },
  {
    number: "02",
    tag: "Precio",
    icon: BadgePercent,
    title: "El precio correcto, siempre",
    body: "Tres listas, acuerdos por cliente y tope de margen. El vendedor cotiza al instante — sin llamar a la oficina y sin regalar plata.",
  },
  {
    number: "03",
    tag: "Pedido",
    icon: PackageCheck,
    title: "El pedido entra solo",
    body: "Carrito en 40 segundos con stock y precio real. Aprobación automática según reglas y sincronización directa al despacho.",
  },
];

export default function FlowSteps() {
  return (
    <section id="como-funciona" className="relative w-full">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Cómo funciona
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Ruta, precio y pedido
            <br />
            en un <span className="text-gradient">solo gesto</span>
          </h2>
        </Reveal>

        <div className="relative mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Línea conectora (desktop) */}
          <div
            aria-hidden
            className="hairline absolute inset-x-16 top-14 hidden md:block"
          />

          {STEPS.map((step, i) => (
            <Reveal key={step.number} delay={i * 0.1}>
              <div className="group relative h-full rounded-3xl border border-line/60 bg-card/45 p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <div className="relative rounded-2xl border border-primary/25 bg-primary/10 p-3.5 text-primary-soft transition-transform duration-300 group-hover:scale-110">
                    <step.icon size={22} />
                  </div>
                  <span className="font-display text-5xl font-black text-panel transition-colors duration-300 group-hover:text-primary/25">
                    {step.number}
                  </span>
                </div>
                <span className="mt-6 inline-block rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-display text-[10px] font-bold tracking-[0.22em] text-primary-soft uppercase">
                  {step.tag}
                </span>
                <h3 className="mt-2 font-display text-xl font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ink">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
