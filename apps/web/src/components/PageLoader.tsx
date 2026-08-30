"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

type PageLoaderProps = {
  children: ReactNode;
  /** ms mínimos del splash (solo estética) */
  minMs?: number;
};

/**
 * Splash de carga al entrar al sitio.
 * Cobre + marca · barra de progreso · fade-out al contenido.
 */
export default function PageLoader({ children, minMs = 1100 }: PageLoaderProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"loading" | "out" | "done">("loading");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduce) {
      setPhase("done");
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / minMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPhase("out");
        window.setTimeout(() => setPhase("done"), 420);
      }
    };

    raf = requestAnimationFrame(tick);

    // Si el documento ya cargó recursos pesados, no alargamos de más
    const onLoad = () => {
      /* el minMs manda para sensación de marca */
    };
    window.addEventListener("load", onLoad);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", onLoad);
    };
  }, [minMs, reduce]);

  return (
    <>
      <AnimatePresence>
        {phase !== "done" && (
          <motion.div
            key="loader"
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-navy"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            aria-busy="true"
            aria-label="Cargando Black Sheep"
          >
            {/* glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute h-[320px] w-[320px] rounded-full bg-primary/20 blur-[100px]"
            />

            <motion.div
              className="relative flex flex-col items-center gap-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
            >
              {/* Mark */}
              <motion.div
                className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-card text-2xl font-black text-primary-soft shadow-lg shadow-primary/20"
                animate={
                  reduce
                    ? undefined
                    : { scale: [1, 1.06, 1], rotate: [0, -3, 0] }
                }
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                BS
              </motion.div>

              <div className="text-center">
                <p className="font-display text-sm font-bold tracking-[0.22em] text-primary-soft uppercase">
                  Black Sheep
                </p>
                <p className="mt-1 text-xs font-medium text-ink/70">
                  Preparando la operación…
                </p>
              </div>

              {/* Progress track */}
              <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-soft"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.05 }}
                />
              </div>
              <span className="font-display text-[11px] font-bold tabular-nums tracking-wider text-ink/50">
                {progress}%
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: phase === "done" || reduce ? 1 : 0.3 }}
        transition={{ duration: 0.5 }}
      >
        {children}
      </motion.div>
    </>
  );
}
