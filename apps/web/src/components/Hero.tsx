"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Magnetic from "@/components/Magnetic";
import ProductPhoneMock from "@/components/ProductPhoneMock";
import ControlCenterMock from "@/components/ControlCenterMock";

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-40 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(57,255,20,0.08),transparent_55%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary uppercase">
            Black Sheep Field
          </p>
          <h1 className="mt-4 font-display text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
            Tu equipo vende más.
            <span className="block text-primary">
              Black Sheep decide dónde, qué y a qué precio.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink sm:text-base">
            Una plataforma comercial para distribución que conecta
            vendedores, clientes, productos, precios, pedidos y gerencia en
            un solo sistema — no una app de rutas más.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetic>
              <a
                href="#circulo"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-black text-black shadow-[0_0_30px_rgba(57,255,20,0.3)] transition hover:brightness-110"
              >
                Ver cómo funciona
                <ArrowRight className="h-4 w-4" />
              </a>
            </Magnetic>
            <a
              href="https://app.black-sheep.cl"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-sm font-bold text-white transition hover:border-primary/40 hover:text-primary"
            >
              Entrar a la plataforma
            </a>
          </div>
          <p className="mt-6 text-xs text-white/35">
            Terreno · KAM · Televenta · Gerencia — la misma verdad, un solo sistema.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative mx-auto flex w-full max-w-[480px] items-center justify-center"
        >
          <div className="relative z-10 w-[62%] max-w-[210px]">
            <ProductPhoneMock compact />
          </div>
          <div className="relative -ml-10 w-[70%] max-w-[320px] translate-y-6 md:-ml-14">
            <ControlCenterMock compact />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
