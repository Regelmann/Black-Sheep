"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  ChevronsDown,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import ScrambleText from "@/components/ScrambleText";
import Magnetic from "@/components/Magnetic";

// Sigma/WebGL solo en cliente: evita errores de 'window' durante el build.
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink/70">
      <span className="animate-pulse">Inicializando red operativa…</span>
    </div>
  ),
});

const FEED = [
  { tag: "PEDIDO", tone: "mint", text: "Pedido $1.240.500 confirmado · KeyFoods Providencia" },
  { tag: "RUTA", tone: "sky", text: "Ruta optimizada · 9 paradas · 74 km · Nor-Oriente" },
  { tag: "FUGA", tone: "rose", text: "−24% volumen · Local Macul · revisar esta semana" },
  { tag: "PRECIO", tone: "amber", text: "Acuerdo Lista 3 actualizado · Distribuidora Andes" },
  { tag: "STOCK", tone: "rose", text: "Quiebre SKU 0884 · Zona Sur · sugerir reposición" },
] as const;

const TONES: Record<string, string> = {
  mint: "bg-mint/15 text-mint border-mint/25",
  sky: "bg-sky/15 text-sky border-sky/25",
  rose: "bg-rose/15 text-rose border-rose/25",
  amber: "bg-amber/15 text-amber border-amber/25",
};

function LiveTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % FEED.length), 3400);
    return () => clearInterval(id);
  }, []);

  const item = FEED[index];

  return (
    <div className="pointer-events-none relative z-10 flex items-center gap-2.5 overflow-hidden rounded-2xl border border-line/70 bg-navy/85 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
      <span
        className={`shrink-0 rounded-md border px-2 py-0.5 font-display text-[10px] font-bold tracking-widest ${TONES[item.tone]}`}
      >
        {item.tag}
      </span>
      <div className="relative h-4 min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.span
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className="absolute inset-0 truncate text-xs font-medium text-mist/90"
          >
            {item.text}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  // Parallax de profundidad: la copia se queda, la red se aleja más rápido
  const copyY = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const graphY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  return (
    <section
      ref={sectionRef}
      id="top"
      className="relative w-full overflow-hidden"
    >
      {/* Retícula con desvanecido */}
      <div aria-hidden className="bg-grid mask-radial absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-6 pt-36 pb-20 lg:grid-cols-[1.02fr_0.98fr] lg:pt-40 lg:pb-24">
        {/* ---- Columna de mensaje ---- */}
        <motion.div style={{ y: copyY }} className="max-w-xl">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-bold tracking-widest text-primary-soft uppercase">
              <Sparkles size={13} />
              <ScrambleText text="Hecho para el terreno chileno" />
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="mt-6 font-display text-6xl leading-[0.95] font-black tracking-tight text-white sm:text-7xl"
          >
            Ruta. Precio.
            <br />
            <span className="text-gradient">
              <ScrambleText text="Pedido." delay={550} tickMs={55} />
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="mt-6 max-w-lg text-lg leading-relaxed text-ink"
          >
            La plataforma que usa el vendedor en terreno y la gerencia en la
            oficina. Metas, focos, riesgo de fuga y stock operativos en el
            bolsillo — sin un solo Excel abierto.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
            <Magnetic strength={0.3}>
              <a
                href="#demo"
                className="btn-shine group inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-4 text-sm font-bold text-black shadow-xl shadow-primary/25 transition-all hover:bg-primary-soft hover:shadow-primary/45 active:scale-95"
              >
                Agenda una demo
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </a>
            </Magnetic>
            <a
              href="#producto"
              className="rounded-xl border border-line/80 bg-card/60 px-6 py-4 text-sm font-semibold text-mist/85 transition-all hover:border-line hover:bg-panel active:scale-95"
            >
              Ver el producto
            </a>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={4}
            className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-ink/80"
          >
            <span className="flex items-center gap-1.5">
              <span className="flex text-amber">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={13} fill="currentColor" strokeWidth={0} />
                ))}
              </span>
              <strong className="font-bold text-white">4,9/5</strong> en
              satisfacción
            </span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span>
              <strong className="font-bold text-white">+120</strong>{" "}
              distribuidoras operando
            </span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span>
              <strong className="font-bold text-white">1,9M</strong> pedidos
              gestionados
            </span>
          </motion.div>
        </motion.div>

        {/* ---- Panel de simulación Sigma ---- */}
        <motion.div style={{ y: graphY }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          {/* KPI flotante: ticket */}
          <div className="animate-floaty absolute right-0 bottom-full z-30 mb-3 hidden items-center gap-2.5 rounded-2xl border border-mint/25 bg-navy/90 px-4 py-3 shadow-2xl backdrop-blur-md lg:flex">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint/15 text-mint">
              <TrendingUp size={15} />
            </span>
            <div>
              <p className="font-display text-sm font-black text-white">+18%</p>
              <p className="text-[10px] font-medium tracking-wide text-ink">
                ticket promedio · foco NBA
              </p>
            </div>
          </div>

          {/* KPI flotante: sync */}
          <div className="animate-floaty-slow absolute top-full left-0 z-30 mt-3 hidden items-center gap-2.5 rounded-2xl border border-sky/25 bg-navy/90 px-4 py-3 shadow-2xl backdrop-blur-md lg:flex">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky/15 text-sky">
              <RefreshCw size={15} />
            </span>
            <div>
              <p className="font-display text-sm font-black text-white">
                Orden sincronizada
              </p>
              <p className="text-[10px] font-medium tracking-wide text-ink">
                hace 2 minutos · modo offline
              </p>
            </div>
          </div>

          {/* Tarjeta dashboard */}
          <div className="glow-primary relative h-[440px] overflow-hidden rounded-3xl border border-line/70 bg-card/45 backdrop-blur-sm sm:h-[500px] lg:h-[560px]">
            {/* Barra superior del panel */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-mint/80" />
                <span className="ml-3 font-display text-[11px] font-bold tracking-[0.18em] text-ink/80 uppercase">
                  Red operativa · RM
                </span>
              </div>
              <span className="flex items-center gap-2 rounded-lg border border-mint/25 bg-navy/90 px-2.5 py-1 text-[10px] font-bold tracking-widest text-mint uppercase">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
                </span>
                En vivo
              </span>
            </div>

            {/* Canvas Sigma */}
            <div className="absolute inset-0">
              <NetworkGraph />
            </div>

            {/* Hint de exploración */}
            <div className="pointer-events-none absolute top-16 right-4 z-10 hidden items-center gap-2 rounded-xl border border-line/60 bg-navy/85 px-3 py-1.5 backdrop-blur-sm sm:flex">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary-soft" />
              <span className="text-[10px] font-bold tracking-widest text-ink uppercase">
                Arrastra para explorar la red
              </span>
            </div>

            {/* Degradado inferior + ticker */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-navy via-navy/70 to-transparent p-4 pt-16">
              <LiveTicker />
            </div>
          </div>
        </motion.div>
        </motion.div>
      </div>

      {/* Hint de scroll */}
      <motion.div
        style={{ opacity: hintOpacity }}
        className="pointer-events-none absolute inset-x-0 bottom-6 z-20 hidden flex-col items-center gap-2.5 lg:flex"
      >
        <motion.span
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-9 w-9 place-items-center rounded-full border border-line/70 bg-navy/70 text-ink backdrop-blur-sm"
        >
          <ChevronsDown size={16} />
        </motion.span>
        <span className="font-display text-[10px] font-bold tracking-[0.3em] text-ink/70 uppercase">
          Desliza · sistema en vivo
        </span>
      </motion.div>
    </section>
  );
}
