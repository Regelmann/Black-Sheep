"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** Barra de progreso de lectura, fijada sobre la navbar. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 28,
    mass: 0.3,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-gradient-to-r from-sky via-primary-soft to-mint"
    />
  );
}
