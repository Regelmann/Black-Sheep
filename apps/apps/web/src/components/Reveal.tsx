"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export type RevealVariant = "up" | "down" | "left" | "right" | "scale" | "fade";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  variant?: RevealVariant;
  duration?: number;
  once?: boolean;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function offsets(variant: RevealVariant, y: number, reduce: boolean | null) {
  if (reduce) return { opacity: 0 };
  switch (variant) {
    case "down":
      return { opacity: 0, y: -y };
    case "left":
      return { opacity: 0, x: -y };
    case "right":
      return { opacity: 0, x: y };
    case "scale":
      return { opacity: 0, scale: 0.94 };
    case "fade":
      return { opacity: 0 };
    case "up":
    default:
      return { opacity: 0, y };
  }
}

function visible(variant: RevealVariant) {
  switch (variant) {
    case "left":
    case "right":
      return { opacity: 1, x: 0 };
    case "scale":
      return { opacity: 1, scale: 1 };
    case "fade":
      return { opacity: 1 };
    default:
      return { opacity: 1, y: 0 };
  }
}

/**
 * Entrada al viewport. Respetá prefers-reduced-motion.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  variant = "up",
  duration = 0.7,
  once = true,
}: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={offsets(variant, y, reduce)}
      whileInView={visible(variant)}
      viewport={{ once, margin: "-70px", amount: 0.2 }}
      transition={{ duration: reduce ? 0.01 : duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
