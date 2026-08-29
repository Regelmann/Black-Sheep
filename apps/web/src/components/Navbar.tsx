"use client";

import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import Magnetic from "@/components/Magnetic";

const LINKS = [
  { href: "#producto", label: "Producto" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#impacto", label: "Impacto" },
  { href: "#precios", label: "Precios" },
  { href: "#faq", label: "FAQ" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  // Se esconde al bajar y reaparece al subir (patrón lectura cómoda)
  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    setHidden(latest > previous && latest > 170);
    setScrolled(latest > 24);
  });

  return (
    <motion.header
      animate={{ y: hidden && !open ? -110 : 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line/60 bg-navy/85 shadow-[0_12px_40px_-18px_rgba(3,7,26,0.9)] backdrop-blur-xl"
          : "border-b border-transparent bg-navy/40 backdrop-blur-md"
      }`}
    >
      <nav className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-6">
        <Logo />

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
          <Magnetic strength={0.26}>
          {/* Ingreso a la app. Un vendedor que entra a black-sheep.cl
              tiene que poder llegar a su app. Va ANTES del CTA de demo:
              quien ya es cliente no viene a agendar nada. */}
          <a
            href="https://app.black-sheep.cl/"
            className="inline-flex items-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-primary/60 hover:text-primary"
          >
            Ingresar
          </a>
            <a
              href="#demo"
              className="btn-shine group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-soft hover:shadow-primary/40 active:scale-95"
            >
              Agenda una demo
              <ArrowRight
                size={15}
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </a>
          </Magnetic>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-line/70 text-ink transition hover:text-white lg:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-b border-line/60 bg-navy/95 backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-ink transition hover:bg-panel/60 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="https://app.black-sheep.cl/"
                className="mb-2 block rounded-xl border border-white/20 px-4 py-3 text-center text-sm font-semibold text-white"
              >
                Ingresar a la app
              </a>
              <a
                href="#demo"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white"
              >
                Agenda una demo <ArrowRight size={15} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
