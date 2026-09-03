"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";

/** UF referencial ~30-ago-2026 */
const UF = 40872;
const ANNUAL_FACTOR = 10 / 12; // 2 meses de descuento

function clp(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

type Plan = {
  id: string;
  name: string;
  rango: string;
  tagline: string;
  uf: number;
  features: string[];
  detalle: string[]; // lo que se ve al dar vuelta la tarjeta
  cta: string;
  recomendado?: boolean;
};

const plans: Plan[] = [
  {
    id: "campo",
    name: "Campo",
    rango: "1–3 vendedores",
    tagline: "Para el equipo que recién sale a terreno.",
    uf: 6,
    features: [
      "App de terreno (Hoy, Mapa, Clientes)",
      "Ruta del día y check-in GPS",
      "Pedidos con precio por cliente",
      "Catálogo web al cliente",
    ],
    detalle: [
      "1 lista de precios + histórico de compras",
      "Soporte por WhatsApp en horario hábil",
      "Onboarding guiado (self-service)",
      "Hasta 3 vendedores incluidos, sin cargo extra por asiento",
    ],
    cta: "Elegir Campo",
  },
  {
    id: "comando",
    name: "Comando",
    rango: "4 o más vendedores",
    tagline: "Operación completa: terreno + gerencia.",
    uf: 10,
    features: [
      "Todo lo de Campo",
      "Next-Best-Action y focos diarios",
      "Alertas de fuga y reposición",
      "Gerencia y tablero en vivo",
    ],
    detalle: [
      "3 listas + acuerdos por cliente",
      "Sync ERP / API y onboarding acompañado",
      "Soporte prioritario",
      "Equipo de hasta 15 vendedores incluido — más de eso, cotización Enterprise",
    ],
    cta: "Elegir Comando",
    recomendado: true,
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);

  function toggleFlip(id: string) {
    setFlipped((f) => ({ ...f, [id]: !f[id] }));
  }

  return (
    <section id="precios" className="relative scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase">
            Precios
          </p>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Claro en UF.
            <span className="text-primary"> Por tramo de equipo.</span>
          </h2>
          <p className="mt-4 text-ink">
            No es por vendedor: es un precio fijo por tramo de tamaño de equipo.
            UF referencial {clp(UF)} (Banco Central). El monto en pesos se
            actualiza con la UF del día de facturación.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-line bg-card p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                !annual ? "bg-primary text-black" : "text-ink hover:text-white"
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                annual ? "bg-primary text-black" : "text-ink hover:text-white"
              }`}
            >
              Anual{" "}
              <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                −2 meses
              </span>
            </button>
          </div>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {plans.map((p) => {
            const monthlyClp = p.uf * UF;
            const billed = annual ? monthlyClp * ANNUAL_FACTOR : monthlyClp;
            const isFlipped = !!flipped[p.id];
            const isSelected = selected === p.id;

            return (
              <div key={p.id} className="[perspective:1600px]">
                <motion.div
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="relative min-h-[560px] w-full [transform-style:preserve-3d]"
                >
                  {/* FRENTE */}
                  <article
                    className={`absolute inset-0 flex flex-col rounded-3xl border p-8 [backface-visibility:hidden] ${
                      isSelected
                        ? "border-primary bg-card shadow-[0_0_60px_rgba(57,255,20,0.18)]"
                        : "border-line bg-card/60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] font-bold tracking-wide text-primary uppercase">
                          {p.rango}
                        </p>
                        <h3 className="mt-1 font-display text-2xl font-black text-white">
                          {p.name}
                        </h3>
                      </div>
                      {p.recomendado && (
                        <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-black tracking-wide text-black uppercase">
                          Recomendado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink">{p.tagline}</p>

                    <div className="mt-6">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-5xl font-black text-white">
                          {p.uf}
                        </span>
                        <span className="text-lg font-bold text-primary">UF</span>
                        <span className="text-sm text-ink">/ mes, por empresa</span>
                      </div>
                      <p className="mt-2 text-sm text-ink">
                        ≈ {clp(billed)}
                        {annual ? " /mes (facturación anual)" : " /mes"}
                      </p>
                      {annual && (
                        <p className="mt-1 text-xs text-primary/90">
                          Equivale a 10 meses · ahorrás {clp(monthlyClp * 2)} al año
                        </p>
                      )}
                    </div>

                    <ul className="mt-8 flex-1 space-y-3">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2 text-sm text-mist/90">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(p.id)}
                        className={`inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-bold transition ${
                          isSelected
                            ? "bg-primary text-black shadow-lg shadow-primary/25"
                            : "border border-line bg-white/5 text-white hover:border-primary/50"
                        }`}
                      >
                        {isSelected ? "✓ Elegido" : p.cta}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFlip(p.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-ink transition hover:text-primary"
                      >
                        Ver qué más incluye
                      </button>
                    </div>
                  </article>

                  {/* DORSO */}
                  <article
                    className="absolute inset-0 flex flex-col rounded-3xl border border-primary/40 bg-card p-8 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                  >
                    <p className="text-[11px] font-bold tracking-wide text-primary uppercase">
                      {p.name} · en detalle
                    </p>
                    <ul className="mt-5 flex-1 space-y-4">
                      {p.detalle.map((d) => (
                        <li key={d} className="flex gap-2 text-sm text-mist/90">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {d}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 flex flex-col gap-2">
                      <a
                        href="#demo"
                        className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-primary/25 transition hover:brightness-110"
                      >
                        {p.cta} →
                      </a>
                      <button
                        type="button"
                        onClick={() => toggleFlip(p.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-ink transition hover:text-primary"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Volver
                      </button>
                    </div>
                  </article>
                </motion.div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink">
          ¿Más de 15 vendedores o varias zonas/marcas? Enterprise se cotiza a
          medida — <a href="#demo" className="font-bold text-primary hover:underline">conversemos tu caso</a>.
        </p>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink">
          Comparativa mercado field sales 2026: Badger ~USD 58–69, SalesRabbit ~USD 49–75,
          Map My Customers desde USD 99 — precios por vendedor. Nuestros planes son por
          empresa, en UF, y se cotizan en pesos al valor UF del día.
        </p>
      </div>
    </section>
  );
}
