"use client";

import { useState } from "react";
import { motion } from "framer-motion";

/** UF referencial ~30-ago-2026 */
const UF = 40872;
const PLAN_CAMPO_UF = 6;
const PLAN_COMANDO_UF = 10;
const ANNUAL_FACTOR = 10 / 12; // 2 meses de descuento

function clp(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

const plans = [
  {
    id: "campo",
    name: "Campo",
    tagline: "Para el equipo que vive en la calle.",
    uf: PLAN_CAMPO_UF,
    features: [
      "App de terreno (Hoy, Mapa, Clientes)",
      "Ruta del día y check-in GPS",
      "Pedidos con precio por cliente",
      "Catálogo web al cliente",
      "1 lista de precios + histórico",
      "Soporte por WhatsApp en horario hábil",
    ],
    cta: "Empezar con Campo",
    featured: false,
  },
  {
    id: "comando",
    name: "Comando",
    tagline: "Operación completa: terreno + gerencia.",
    uf: PLAN_COMANDO_UF,
    features: [
      "Todo lo de Campo",
      "Next-Best-Action y focos diarios",
      "Alertas de fuga y reposición",
      "3 listas + acuerdos por cliente",
      "Gerencia y tablero en vivo",
      "Sync ERP / API y onboarding acompañado",
    ],
    cta: "Elegir Comando",
    featured: true,
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="precios" className="relative scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase">
            Precios
          </p>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Claro en UF.
            <span className="text-primary"> Sin letra chica.</span>
          </h2>
          <p className="mt-4 text-ink">
            Por vendedor / mes. UF referencial {clp(UF)} (Banco Central). El monto en pesos
            se actualiza con la UF del día de facturación.
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
            return (
              <motion.article
                key={p.id}
                whileHover={{ y: -6 }}
                className={`relative flex flex-col rounded-3xl border p-8 ${
                  p.featured
                    ? "border-primary bg-card shadow-[0_0_60px_rgba(57,255,20,0.12)]"
                    : "border-line bg-card/60"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-[11px] font-black tracking-wide text-black uppercase">
                    Más elegido
                  </span>
                )}
                <h3 className="font-display text-2xl font-black text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-ink">{p.tagline}</p>
                <div className="mt-6">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl font-black text-white">
                      {p.uf}
                    </span>
                    <span className="text-lg font-bold text-primary">UF</span>
                    <span className="text-sm text-ink">/ vendedor / mes</span>
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
                      <span className="mt-0.5 text-primary">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#demo"
                  className={`mt-8 inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-bold transition ${
                    p.featured
                      ? "bg-primary text-black shadow-lg shadow-primary/25 hover:brightness-110"
                      : "border border-line bg-white/5 text-white hover:border-primary/50"
                  }`}
                >
                  {p.cta} →
                </a>
              </motion.article>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-xs text-ink">
          Comparativa mercado field sales 2026: Badger ~USD 58–69, SalesRabbit ~USD 49–75,
          Map My Customers desde USD 99. Nuestros planes en UF se reajustan con inflación
          chilena y se cotizan en pesos al valor UF del día.
        </p>
      </div>
    </section>
  );
}
