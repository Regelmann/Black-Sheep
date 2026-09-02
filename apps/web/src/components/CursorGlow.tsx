"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/**
 * Luz ambiental que persigue el cursor (solo punteros finos, desktop).
 * Añade profundidad "film set" sin bloquear interacciones.
 */
export default function CursorGlow() {
  const reduce = useReducedMotion();
  const [enabled, setEnabled] = useState(false);

  const mx = useMotionValue(-600);
  const my = useMotionValue(-600);
  const x = useSpring(mx, { stiffness: 55, damping: 18, mass: 0.6 });
  const y = useSpring(my, { stiffness: 55, damping: 18, mass: 0.6 });

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer || reduce) return;
    // setState asíncrono: evitar cascade de renders (react-hooks/set-state-in-effect).
    queueMicrotask(() => setEnabled(true));

    const onMove = (event: PointerEvent) => {
      mx.set(event.clientX);
      my.set(event.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, reduce]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[30] overflow-hidden">
      <motion.div
        style={{ x, y }}
        className="absolute -top-[280px] -left-[280px] h-[560px] w-[560px] rounded-full opacity-[0.11] mix-blend-screen blur-[110px]"
      >
        <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_center,#7551ff_0%,#4318ff_38%,transparent_68%)]" />
      </motion.div>
    </div>
  );
}
