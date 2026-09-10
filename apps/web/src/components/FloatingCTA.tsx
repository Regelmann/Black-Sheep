"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import Magnetic from "@/components/Magnetic";

/** Píldora flotante de conversión: aparece tras el hero y se esconde en #demo. */
export default function FloatingCTA() {
  const { scrollY } = useScroll();
  const [pastHero, setPastHero] = useState(false);
  const [demoVisible, setDemoVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setPastHero(latest > 720);
  });

  useEffect(() => {
    // Se oculta al llegar al demo Y al footer.
    // Antes sólo miraba #demo: el footer va DESPUÉS, así que la barra
    // volvía a aparecer y lo tapaba por completo. Por eso "el footer
    // no existe" — sí existe, estaba debajo de esta barra.
    const objetivos = [
      document.getElementById("demo"),
      document.querySelector("footer"),
    ].filter(Boolean) as Element[];
    if (!objetivos.length) return;

    const vistos = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target)));
        setDemoVisible(vistos.size > 0);
      },
      { rootMargin: "-12% 0px" },
    );
    objetivos.forEach((o) => observer.observe(o));
    return () => observer.disconnect();
  }, []);

  const show = pastHero && !demoVisible;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 hidden justify-center sm:flex">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ y: 72, opacity: 0, filter: "blur(6px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 72, opacity: 0, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            className="pointer-events-auto flex items-center gap-4 rounded-full border border-line/70 bg-navy/88 py-2 pr-2 pl-5 shadow-[0_20px_60px_-16px_rgba(3,7,26,0.95)] backdrop-blur-xl"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-ink">
              <span className="relative flex h-2 w-2">
                <span className="absolute h-full w-full animate-ping rounded-full bg-mint opacity-70" />
                <span className="relative h-2 w-2 rounded-full bg-mint" />
              </span>
              <span className="hidden md:inline">
                Te contactamos en menos de 24 h hábiles ·
              </span>{" "}
              <strong className="text-white">Agenda tu demo</strong>
            </span>
            <Magnetic strength={0.22}>
              <a
                href="#demo"
                className="btn-shine group inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-black text-black transition hover:bg-primary-soft active:scale-95"
              >
                Empezar
                <ArrowRight
                  size={13}
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </a>
            </Magnetic>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
