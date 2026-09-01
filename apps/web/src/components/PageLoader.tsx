"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

export default function PageLoader({
  children,
  minMs = 1800,
}: {
  children: ReactNode;
  minMs?: number;
}) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / minMs);
      setProgress(Math.round((1 - Math.pow(1 - t, 3)) * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setShow(false), 80);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [minMs, reduce]);

  return (
    <>
      <AnimatePresence>
        {show && !reduce && (
          <motion.div
            key="loader"
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-black"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            aria-busy="true"
            aria-label="Cargando Black Sheep"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-primary/20 blur-[120px]"
              animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.9, 1.06, 0.9] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative flex flex-col items-center gap-8">
              <motion.div
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <div className="absolute inset-0 scale-125 rounded-full bg-primary/25 blur-2xl" />
                <Image
                  src="/brand/logo-mark.png"
                  alt="Black Sheep"
                  width={140}
                  height={140}
                  priority
                  className="relative drop-shadow-[0_0_40px_rgba(57,255,20,0.55)]"
                />
              </motion.div>
              <div className="text-center">
                <p className="font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
                  Black Sheep <span className="text-primary">Field</span>
                </p>
                <p className="mt-2 text-[11px] font-bold tracking-[0.28em] text-ink uppercase">
                  Ruta · Precio · Pedido
                </p>
              </div>
              <div className="h-[2px] w-44 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
