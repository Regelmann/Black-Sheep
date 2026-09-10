import { Braces, FileSpreadsheet } from "lucide-react";
import Reveal from "@/components/Reveal";

const INTEGRATIONS = [
  { initials: "So", name: "Softland", tone: "from-sky to-primary-soft", badge: "Conector listo" },
  { initials: "De", name: "Defontana", tone: "from-mint to-sky", badge: "Conector listo" },
  { initials: "Bs", name: "Bsale", tone: "from-amber to-rose", badge: "Conector listo" },
  { initials: "Nx", name: "Nubox", tone: "from-primary-soft to-rose", badge: "Conector listo" },
  { initials: "SAP", name: "Business One", tone: "from-sky to-mint", badge: "Vía API" },
  { initials: "Od", name: "Odoo", tone: "from-rose to-primary-soft", badge: "Vía API" },
];

export default function Integrations() {
  return (
    <section className="relative w-full">
      <div className="mx-auto w-full max-w-7xl px-6 py-20">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Integraciones
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Tus sistemas, <span className="text-gradient">conectados</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Pedidos, clientes y precios fluyen en ambas direcciones con tu ERP y
            tu facturación. Sin doble digitación, nunca más.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {INTEGRATIONS.map((item) => (
              <div
                key={item.name}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-line/60 bg-card/40 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br font-display text-sm font-black text-navy-deep ${item.tone}`}
                >
                  {item.initials}
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{item.name}</p>
                  <p className="mt-1 text-[10px] font-bold tracking-widest text-ink/70 uppercase">
                    {item.badge}
                  </p>
                </div>
              </div>
            ))}

            {[
              { icon: Braces, name: "API REST + Webhooks", badge: "Docs incluidas" },
              { icon: FileSpreadsheet, name: "Export a Sheets / Excel", badge: "1 clic" },
            ].map(({ icon: Icon, name, badge }) => (
              <div
                key={name}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-navy-deep/60 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel text-primary-soft">
                  <Icon size={20} />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{name}</p>
                  <p className="mt-1 text-[10px] font-bold tracking-widest text-ink/70 uppercase">
                    {badge}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-8 text-center text-xs text-ink/70">
            ¿Usas otro sistema?{" "}
            <a
              href="#demo"
              className="font-semibold text-primary-soft underline-offset-4 hover:underline"
            >
              Conversemos tu caso en la demo
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
