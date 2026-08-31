"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

type StatDef = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
};

const STATS: StatDef[] = [
  {
    value: 31,
    prefix: "−",
    suffix: "%",
    label: "fuga de cartera detectada a tiempo",
  },
  {
    value: 18,
    prefix: "+",
    suffix: "%",
    label: "ticket promedio con foco Next-Best-Action",
  },
  {
    value: 4.2,
    decimals: 1,
    suffix: " h",
    label: "ahorradas por vendedor, cada semana",
  },
  {
    value: 97,
    suffix: "%",
    label: "de los pedidos entran correctos a la primera",
  },
];

function Counter({ value, decimals = 0, prefix = "", suffix = "" }: StatDef) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(
    decimals ? (0).toFixed(decimals).replace(".", ",") : "0",
  );

  useEffect(() => {
    if (!inView) return;
    const duration = 1600;
    let start: number | null = null;
    let raf = 0;

    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = value * eased;
      setDisplay(
        decimals > 0
          ? v.toFixed(decimals).replace(".", ",")
          : Math.round(v).toString(),
      );
      if (p < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, decimals]);

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

export default function Stats() {
  return (
    <section id="impacto" className="relative border-y border-line/40 bg-navy-deep/60">
      <div className="mx-auto w-full max-w-7xl px-6 py-14">
        <p className="mb-10 text-center font-display text-[11px] font-bold tracking-[0.28em] text-ink/60 uppercase">
          Resultados medidos en operación real · 2025
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-4xl font-black tracking-tight text-white tabular-nums sm:text-5xl">
                <Counter {...stat} />
              </p>
              <p className="mx-auto mt-2.5 max-w-[210px] text-xs leading-snug text-ink">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
