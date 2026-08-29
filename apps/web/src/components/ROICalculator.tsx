"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, TrendingUp, Undo2, Wallet } from "lucide-react";
import Reveal from "@/components/Reveal";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const PLAN_EQUPO_MENSUAL = 34_990; // por vendedor, sin IVA
const UPLIFT_NBA = 0.1; // +10% ticket por foco Next-Best-Action (observado: +18%)
const FUGA_SILENCIOSA = 0.02; // 2% de la venta se va cada mes sin señal
const RECUPERACION_FUGA = 0.6; // se recupera ~60% actuando a tiempo
const HORAS_SEMANA_VENDEDOR = 4.2;

export default function ROICalculator() {
  const [vendedores, setVendedores] = useState(6);
  const [pedidosSemana, setPedidosSemana] = useState(25);
  const [ticket, setTicket] = useState(80_000);

  const resultado = useMemo(() => {
    const ventasMes = vendedores * pedidosSemana * ticket * 4.33;
    const uplift = ventasMes * UPLIFT_NBA;
    const fuga = ventasMes * FUGA_SILENCIOSA * RECUPERACION_FUGA;
    const impacto = uplift + fuga;
    const horas = Math.round(vendedores * HORAS_SEMANA_VENDEDOR * 4.33);
    const costo = vendedores * PLAN_EQUPO_MENSUAL;
    const paybackDias = Math.min(90, Math.max(1, Math.round((costo / Math.max(impacto, 1)) * 30)));
    return { ventasMes, uplift, fuga, impacto, horas, costo, paybackDias };
  }, [vendedores, pedidosSemana, ticket]);

  const sliders = [
    {
      label: "Vendedores en terreno",
      value: vendedores,
      set: setVendedores,
      min: 1,
      max: 50,
      step: 1,
      display: `${vendedores}`,
    },
    {
      label: "Pedidos por vendedor / semana",
      value: pedidosSemana,
      set: setPedidosSemana,
      min: 5,
      max: 60,
      step: 5,
      display: `${pedidosSemana}`,
    },
    {
      label: "Ticket promedio por pedido",
      value: ticket,
      set: setTicket,
      min: 10_000,
      max: 500_000,
      step: 5_000,
      display: clp.format(ticket),
    },
  ];

  return (
    <section id="impacto" className="relative w-full border-y border-line/40 bg-navy-deep/40">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Calculadora de impacto
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            ¿Cuánto te está dejando de ganar
            <br />
            <span className="text-gradient">el WhatsApp y la planilla?</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Mueve los deslizadores con los números de tu operación. La
            estimación usa supuestos conservadores frente a lo medido en
            clientes reales.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* Sliders */}
          <Reveal className="h-full">
            <div className="flex h-full flex-col justify-center gap-9 rounded-3xl border border-line/60 bg-card/45 p-8">
              {sliders.map((slider) => {
                const pct =
                  ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
                return (
                  <div key={slider.label}>
                    <div className="mb-3 flex items-end justify-between">
                      <label className="text-sm font-bold text-mist">
                        {slider.label}
                      </label>
                      <span className="font-display text-xl font-black text-white tabular-nums">
                        {slider.display}
                      </span>
                    </div>
                    <input
                      type="range"
                      className="slider"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={slider.value}
                      onChange={(e) => slider.set(Number(e.target.value))}
                      style={{ "--fill": `${pct}%` } as CSSProperties}
                      aria-label={slider.label}
                    />
                    <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-ink/60">
                      <span>{slider.label.includes("Ticket") ? clp.format(slider.min) : slider.min}</span>
                      <span>{slider.label.includes("Ticket") ? clp.format(slider.max) : slider.max}</span>
                    </div>
                  </div>
                );
              })}

              <p className="rounded-2xl border border-line/50 bg-navy/60 px-4 py-3 text-[11px] leading-relaxed text-ink">
                Ventas mensuales actuales estimadas:{" "}
                <strong className="font-display text-sm text-white">
                  {clp.format(resultado.ventasMes)}
                </strong>
              </p>
            </div>
          </Reveal>

          {/* Resultados */}
          <Reveal delay={0.1} className="h-full">
            <div className="glow-primary relative flex h-full flex-col overflow-hidden rounded-3xl border border-line/70 bg-card/70 p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-[90px]"
              />

              <p className="font-display text-[11px] font-black tracking-[0.24em] text-ink/70 uppercase">
                Impacto mensual estimado
              </p>
              <div className="relative mt-2 h-16 overflow-hidden">
                <AnimatePresence mode="popLayout">
                  <motion.p
                    key={resultado.impacto}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="absolute font-display text-5xl font-black tracking-tight text-white tabular-nums sm:text-6xl"
                  >
                    {clp.format(resultado.impacto)}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-mint/20 bg-mint/6 px-4 py-3">
                  <span className="flex items-center gap-2.5 text-xs font-bold text-mist">
                    <TrendingUp size={14} className="text-mint" />
                    +10% ticket con foco Next-Best-Action
                  </span>
                  <span className="font-display text-sm font-black text-mint tabular-nums">
                    {clp.format(resultado.uplift)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-sky/20 bg-sky/6 px-4 py-3">
                  <span className="flex items-center gap-2.5 text-xs font-bold text-mist">
                    <Undo2 size={14} className="text-sky" />
                    Fuga silenciosa recuperada a tiempo
                  </span>
                  <span className="font-display text-sm font-black text-sky tabular-nums">
                    {clp.format(resultado.fuga)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-line/50 bg-navy/60 px-4 py-3">
                  <span className="flex items-center gap-2.5 text-xs font-bold text-mist">
                    <Wallet size={14} className="text-primary-soft" />
                    Horas devueltas a tu equipo, al mes
                  </span>
                  <span className="font-display text-sm font-black text-white tabular-nums">
                    {resultado.horas} h
                  </span>
                </div>
              </div>

              <div className="mt-auto pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-5">
                  <p className="text-xs text-ink">
                    Con plan Equipo ({clp.format(resultado.costo)}/mes + IVA),{" "}
                    <strong className="text-mist">
                      se paga solo en ~{resultado.paybackDias}{" "}
                      {resultado.paybackDias === 1 ? "día" : "días"}.
                    </strong>
                  </p>
                  <a
                    href="#demo"
                    className="group inline-flex items-center gap-1.5 text-xs font-black text-primary-soft transition hover:text-white"
                  >
                    Validarlo con mis datos
                    <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                  </a>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-ink/55">
                  Estimación referencial con supuestos conservadores (+10% vs
                    +18% ticket observado; recupera 60% del 2% de fuga mensual).
                    No constituye garantía de resultados.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
