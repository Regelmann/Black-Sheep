import { Quote } from "lucide-react";
import Reveal from "@/components/Reveal";

const TESTIMONIALS = [
  {
    quote:
      "Dejamos el Excel en dos semanas. Hoy el vendedor entra al local sabiendo qué ofrecer y a qué precio. El ticket promedio subió 18% el primer trimestre.",
    initials: "CR",
    name: "Camila Rojas",
    role: "Gerente Comercial",
    company: "AndesAlimentos SpA",
    gradient: "from-sky to-primary-soft",
  },
  {
    quote:
      "La alerta de fuga nos salvó la cartera del verano. Recuperamos 11 clientes que se estaban yendo sin que nadie en la oficina lo notara.",
    initials: "JM",
    name: "Jorge Muñoz",
    role: "Fundador",
    company: "Ferretería El Cóndor",
    gradient: "from-mint to-sky",
  },
  {
    quote:
      "La ruta sola ordena el día. Mis 7 vendedores pasaron de 5 visitas útiles a 9, y todos los pedidos entran correctos a bodega. Sin reprocesos.",
    initials: "PV",
    name: "Paulina Vera",
    role: "Jefa de Ventas",
    company: "AgroSur Insumos",
    gradient: "from-amber to-rose",
  },
];

export default function Testimonials() {
  return (
    <section className="relative w-full border-y border-line/40 bg-navy-deep/40">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Casos de éxito
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Los que ya ordenaron <span className="text-gradient">su terreno</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.09} className="h-full">
              <figure className="flex h-full flex-col justify-between rounded-3xl border border-line/60 bg-card/45 p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/35">
                <div>
                  <Quote
                    size={22}
                    className="text-primary-soft/70"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <blockquote className="mt-4 text-sm leading-relaxed text-mist/90">
                    “{t.quote}”
                  </blockquote>
                </div>
                <figcaption className="mt-7 flex items-center gap-3 border-t border-line/50 pt-5">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br font-display text-xs font-black text-navy-deep ${t.gradient}`}
                  >
                    {t.initials}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-xs text-ink">
                      {t.role} · {t.company}
                    </p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
