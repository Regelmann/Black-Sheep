import { ArrowRight, Building2, MapPin, Users } from "lucide-react";
import Reveal from "@/components/Reveal";

const DELTAS = [
  { label: "Ticket promedio", before: "$680 mil", after: "$802 mil", pct: 88, badge: "+18%" },
  { label: "Fuga de cartera activa", before: "alta", after: "−31%", pct: 69, badge: "−31%" },
  { label: "Visitas útiles por día", before: "5", after: "9", pct: 80, badge: "+4" },
  { label: "Pedidos correctos a la primera", before: "88%", after: "97%", pct: 97, badge: "97%" },
];

export default function CaseStudy() {
  return (
    <section className="relative w-full border-y border-line/40 bg-navy-deep/40">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-6 py-24 lg:grid-cols-[1fr_1.05fr]">
        {/* Narrativa */}
        <Reveal className="space-y-6">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Caso de éxito · 90 días
          </span>
          <h2 className="font-display text-4xl leading-[1.02] font-black tracking-tight text-white sm:text-5xl">
            KeyFoods dejó el Excel
            <br />
            en <span className="text-gradient">12 días</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Distribuidora de alimentos con fuerza de venta en terreno en la Región Metropolitana. Los pedidos llegaban
            por WhatsApp y los precios se consultaban en planillas de 40
            pestañas.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <span className="flex items-center gap-2 rounded-xl border border-line/60 bg-card/50 px-3.5 py-2 text-xs font-bold text-mist">
              <Users size={13} className="text-primary-soft" /> 14 vendedores
            </span>
            <span className="flex items-center gap-2 rounded-xl border border-line/60 bg-card/50 px-3.5 py-2 text-xs font-bold text-mist">
              <Building2 size={13} className="text-primary-soft" /> 900 clientes
            </span>
            <span className="flex items-center gap-2 rounded-xl border border-line/60 bg-card/50 px-3.5 py-2 text-xs font-bold text-mist">
              <MapPin size={13} className="text-primary-soft" /> RM + IV Región
            </span>
          </div>
          <p className="text-base leading-relaxed text-ink">
            Semana 1: migramos clientes, listas y acuerdos desde su Excel.
            Semana 2: los vendedores ya tomaban pedidos en la app. Al mes 3, la
            gerencia abrió el tablero cada mañana en vez de pedir el consolidado
            del viernes.
          </p>
          <blockquote className="rounded-2xl border-l-2 border-mint bg-card/40 p-5">
            <p className="text-sm leading-relaxed text-mist italic">
              “El primer mes recuperamos dos clientes que ya dábamos por
              perdidos. Eso solo pagó el año completo del sistema.”
            </p>
            <footer className="mt-3 flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky to-primary-soft font-display text-[10px] font-black text-navy-deep">
                CR
              </span>
              <span className="text-xs text-ink">
                <strong className="text-white">Camila Rojas</strong> · Gerente
                Comercial, KeyFoods SpA
              </span>
            </footer>
          </blockquote>
          <a
            href="#demo"
            className="group inline-flex items-center gap-2 font-display text-sm font-black text-primary-soft transition hover:text-white"
          >
            Quiero resultados así
            <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </Reveal>

        {/* Tablero de resultados */}
        <Reveal delay={0.12}>
          <div className="glow-primary relative overflow-hidden rounded-3xl border border-line/70 bg-card/60 p-7 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-mint/10 blur-[80px]"
            />
            <div className="flex items-center justify-between">
              <p className="font-display text-[11px] font-black tracking-[0.24em] text-ink/70 uppercase">
                Resultados medidos · día 90
              </p>
              <span className="rounded-lg border border-mint/25 bg-mint/10 px-2.5 py-1 text-[10px] font-black tracking-widest text-mint uppercase">
                Verificado
              </span>
            </div>

            <div className="mt-7 space-y-6">
              {DELTAS.map((delta, i) => (
                <div key={delta.label}>
                  <div className="mb-2 flex items-end justify-between">
                    <p className="text-xs font-bold text-mist">{delta.label}</p>
                    <p className="flex items-baseline gap-2 font-display text-sm">
                      <span className="text-xs font-semibold text-ink/60 line-through">
                        {delta.before}
                      </span>
                      <span className="font-black text-mint">{delta.badge}</span>
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-panel">
                    <Reveal delay={0.15 + i * 0.08} y={0}>
                      <div
                        className={`h-2 rounded-full ${
                          i === 1
                            ? "bg-gradient-to-r from-amber to-mint"
                            : "bg-gradient-to-r from-primary to-mint"
                        }`}
                        style={{ width: `${delta.pct}%` }}
                      />
                    </Reveal>
                  </div>
                  <p className="mt-1.5 text-[10px] text-ink/60">
                    Antes: {delta.before} → Hoy: {delta.after}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-line/50 bg-navy/60 px-5 py-4">
              <p className="text-[11px] leading-relaxed text-ink">
                <strong className="text-mist">Cómo se midió:</strong> comparación
                de ventas y actividad de los 90 días previos vs los 90 días
                posteriores a la implementación, misma temporada y cartera.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
