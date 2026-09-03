"use client";

import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, ChevronsDown } from "lucide-react";
import Magnetic from "@/components/Magnetic";

const HeroAppMock = dynamic(() => import("@/components/HeroAppMock"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink/70">
      <span className="animate-pulse">Cargando red…</span>
    </div>
  ),
});

/**
 * Hero inspirado en landonorris.com:
 * tipografía enorme, poco texto, un objeto vivo a la derecha.
 */
export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-6 pb-16 pt-28"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Copy — peso tipográfico LN */}
        <motion.div style={{ y, opacity }} className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-primary uppercase"
          >
            Hecho para el terreno chileno
          </motion.div>

          <h1 className="font-display text-[clamp(3.25rem,9vw,5.75rem)] leading-[0.92] font-black tracking-[-0.04em] text-white">
            <motion.span
              className="block"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              Ruta.
            </motion.span>
            <motion.span
              className="block"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              Precio.
            </motion.span>
            <motion.span
              className="block text-primary"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              Pedido.
            </motion.span>
          </h1>

          <motion.p
            className="mt-6 max-w-md text-base leading-relaxed text-ink sm:text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Terreno y gerencia en una sola plataforma.
            <span className="text-mist"> Sin Excel.</span>
          </motion.p>

          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <Magnetic>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-black text-black shadow-[0_0_40px_rgba(57,255,20,0.35)] transition hover:brightness-110"
              >
                Agenda una demo
                <ArrowRight className="h-4 w-4" />
              </a>
            </Magnetic>
            <a
              href="#producto"
              className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3.5 text-sm font-bold text-white transition hover:border-primary/50"
            >
              Ver el producto
            </a>
          </motion.div>

          <motion.div
            className="mt-10 flex items-center gap-6 text-xs text-ink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85 }}
          >
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Offline-first
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Precios por cliente
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Hecho en Chile
            </span>
          </motion.div>
        </motion.div>

        {/* El producto, no una ilustración */}
        <motion.div
          className="relative z-10"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.8 }}
        >
          <div className="glow-primary relative aspect-[5/4] overflow-hidden rounded-3xl border border-line bg-card shadow-2xl">
                        {/* 🔴 REEMPLAZA EL GRAFO DE PUNTITOS.
                Se movía, no significaba nada, y al pinchar un nodo
                salía un fondo blanco con texto ilegible. No explicaba
                el producto ni servía de demo.

                Las mejores landings B2B de 2026 ponen el PRODUCTO en
                el hero: Linear su lista de issues, Loom la pantalla de
                grabación, Vercel un deploy real. Ninguna una
                ilustración abstracta. */}
            <HeroAppMock />
          </div>
        </motion.div>
      </div>

      <motion.a
        href="#terreno"
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-[10px] font-bold tracking-[0.2em] text-ink uppercase"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        Scroll
        <ChevronsDown className="h-4 w-4 text-primary" />
      </motion.a>
    </section>
  );
}
