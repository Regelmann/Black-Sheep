"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

type PageLoaderProps = {
  children: ReactNode;
  minMs?: number;
};

/**
 * Splash de carga: logo real + neón sobre negro puro.
 */
export default function PageLoader({ children, minMs = 1400 }: PageLoaderProps) {
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
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPhase("out");
        window.setTimeout(() => setPhase("done"), 450);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [minMs, reduce]);

  return (
    <>
      <AnimatePresence>
        {phase !== "done" && (
          <motion.div
            key="loader"
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            aria-busy="true"
            aria-label="Cargando Black Sheep"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute h-[360px] w-[360px] rounded-full bg-primary/15 blur-[110px]"
            />

            <motion.div
              className="relative flex flex-col items-center gap-7"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                className="relative"
                animate={
                  reduce
                    ? undefined
                    : { scale: [1, 1.04, 1] }
                }
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <Image
                  src="/brand/logo-mark.png"
                  alt="Black Sheep"
                  width={120}
                  height={120}
                  className="h-[100px] w-[100px] object-contain drop-shadow-[0_0_28px_rgba(57,255,20,0.55)] sm:h-[120px] sm:w-[120px]"
                  priority
                />
              </motion.div>

              <div className="text-center">
                <p className="font-display text-xs font-bold tracking-[0.28em] text-primary uppercase">
                  Black Sheep
                </p>
                <p className="mt-1.5 text-xs font-medium text-neutral-500">
                  Inicializando operación…
                </p>
              </div>

              <div className="h-[3px] w-48 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-soft"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.05 }}
                />
              </div>
              <span className="font-display text-[11px] font-bold tabular-nums tracking-widest text-neutral-600">
                {progress}%
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: phase === "done" || reduce ? 1 : 0.25 }}
        transition={{ duration: 0.55 }}
      >
        {children}
      </motion.div>
    </>
  );
}
