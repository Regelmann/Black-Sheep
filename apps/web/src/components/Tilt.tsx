"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";

type TiltProps = {
  children: ReactNode;
  max?: number;
  className?: string;
};

/** Inclinación 3D física que responde al cursor (desktop). */
export default function Tilt({ children, max = 7, className }: TiltProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rX = useMotionValue(0);
  const rY = useMotionValue(0);
  const rotateX = useSpring(rX, { stiffness: 220, damping: 18, mass: 0.4 });
  const rotateY = useSpring(rY, { stiffness: 220, damping: 18, mass: 0.4 });

  function onMove(event: MouseEvent) {
    if (reduce || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    rX.set(-ny * max);
    rY.set(nx * max);
  }

  function onLeave() {
    rX.set(0);
    rY.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={`h-full will-change-transform ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}
