import { ArrowRight, Check } from "lucide-react";
import Reveal from "@/components/Reveal";

const PLANS = [
  {
    name: "Emprendedor",
    price: "$19.990",
    note: "+ IVA · por vendedor/mes",
    description: "Para el primero que sale a la calle con la app en la mano.",
    cta: "Empezar ahora",
    featured: false,
    features: [
      "1 vendedor en terreno",
      "Clientes y ruta del día",
      "Toma de pedidos con fotos",
      "Lista de precios única",
      "Soporte por correo",
    ],
  },
  {
    name: "Equipo",
    price: "$34.990",
    note: "+ IVA · por vendedor/mes",
    description: "La operación completa que ordena una fuerza de ventas real.",
    cta: "Elegir Equipo",
    featured: true,
    features: [
      "Hasta 15 vendedores",
      "Next-Best-Action y focos diarios",
      "Alertas de fuga y recurrencia",
      "3 listas + acuerdos por cliente",
      "Sync con tu ERP y reportes gerenciales",
      "Soporte humano en menos de 4 h",
    ],
  },
  {
    name: "Corporativo",
    price: "A medida",
    note: "implementación acompañada",
    description: "Multi-bodega, multi-marca y las exigencias de tu área de TI.",
    cta: "Hablar con ventas",
    featured: false,
    features: [
      "Vendedores ilimitados",
      "Multi-bodega y multi-marca",
      "API, webhooks y SSO",
      "Migración de datos incluida",
      "Gerente de cuenta dedicado",
      "SLA y acuerdos empresariales",
    ],
  },
];

export default function Pricing() {
  return (
    <section id="precios" className="relative w-full">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Precios
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Precios claros, en pesos,
            <br />
            <span className="text-gradient">sin letra chiquita</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Partes con lo que tu equipo necesita hoy y creces cuando la ruta lo
            pida. Todos los planes incluyen app móvil y acompañamiento en
            español.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.09} className="h-full">
              {plan.featured ? (
                <div className="h-full rounded-3xl bg-gradient-to-b from-primary via-primary-soft to-primary p-[1.5px] shadow-[0_30px_80px_-30px_rgba(67,24,255,0.55)]">
                  <PlanCard plan={plan} />
                </div>
              ) : (
                <div className="h-full rounded-3xl border border-line/60">
                  <PlanCard plan={plan} />
                </div>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="mt-10 text-center text-xs text-ink/70">
            ¿Más de 20 vendedores o varias marcas?{" "}
            <a
              href="#demo"
              className="font-semibold text-primary-soft underline-offset-4 hover:underline"
            >
              Armemos una operación a tu medida
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

type Plan = (typeof PLANS)[number];

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`flex h-full flex-col rounded-[calc(1.5rem-1.5px)] p-8 ${
        plan.featured ? "bg-card" : "bg-card/45"
      }`}
    >
      {plan.featured && (
        <span className="mb-4 w-fit rounded-md border border-primary/35 bg-primary/15 px-2.5 py-1 font-display text-[10px] font-black tracking-[0.2em] text-primary-soft uppercase">
          Más elegido
        </span>
      )}
      <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
      <p className="mt-1.5 text-xs leading-snug text-ink">{plan.description}</p>

      <div className="mt-6 flex items-end gap-2">
        <span className="font-display text-4xl font-black tracking-tight text-white">
          {plan.price}
        </span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-ink/70">{plan.note}</p>

      <a
        href="#demo"
        className={`group mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition-all active:scale-95 ${
          plan.featured
            ? "bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary-soft"
            : "border border-line/80 bg-navy/60 text-mist hover:border-primary/50 hover:bg-panel"
        }`}
      >
        {plan.cta}
        <ArrowRight
          size={15}
          className="transition-transform duration-300 group-hover:translate-x-0.5"
        />
      </a>

      <ul className="mt-8 space-y-3 border-t border-line/50 pt-7">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-ink">
            <span
              className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${
                plan.featured
                  ? "bg-primary/20 text-primary-soft"
                  : "bg-panel text-mint"
              }`}
            >
              <Check size={10} strokeWidth={3} />
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
