"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

type StaggerProps = {
  children: ReactNode;
  className?: string;
  /** delay entre hijos (s) */
  stagger?: number;
  /** delay inicial del grupo */
  delay?: number;
  y?: number;
};

/**
 * Contenedor: anima hijos en cascada al entrar en viewport.
 * Cada hijo directo recibe fade + slide.
 */
export default function Stagger({
  children,
  className,
  stagger = 0.08,
  delay = 0,
  y = 20,
}: StaggerProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px", amount: 0.15 }}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : stagger,
            delayChildren: reduce ? 0 : delay,
          },
        },
      }}
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: reduce ? { opacity: 0 } : { opacity: 0, y },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: reduce ? 0.01 : 0.55, ease: EASE },
                },
              }}
            >
              {child}
            </motion.div>
          ))
        : children}
    </motion.div>
  );
}

/** Item suelto para usar dentro de un motion parent con variants propias */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 18 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: reduce ? 0.01 : 0.55, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
