"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

/**
 * Fondos dinámicos de la landing.
 * - Orbes de color en drift lento
 * - Retícula con parallax suave
 * - Partículas flotantes (pocas, baratas)
 * - Vignette para leer el contenido
 * Respeta prefers-reduced-motion → capa estática.
 */
export default function DynamicBackground() {
  const reduce = useReducedMotion();

  const particles = useMemo(
    () =>
      Array.from({ length: reduce ? 0 : 18 }, (_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 53) % 100}%`,
        size: 2 + (i % 4),
        dur: 10 + (i % 7) * 2.4,
        delay: (i % 5) * 0.8,
        opacity: 0.15 + (i % 4) * 0.06,
      })),
    [reduce],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Base depth */}
      <div className="absolute inset-0 bg-navy" />

      {/* Mesh / aurora */}
      <motion.div
        className="absolute -left-1/4 top-[-20%] h-[70vh] w-[80vw] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(234,88,12,0.18) 0%, transparent 65%)",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: [0, 60, -20, 0],
                y: [0, 30, 50, 0],
                scale: [1, 1.08, 0.96, 1],
              }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-15%] top-[20%] h-[55vh] w-[55vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(56,189,248,0.1) 0%, transparent 70%)",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: [0, -40, 20, 0],
                y: [0, 40, -10, 0],
              }
        }
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-10%] left-[15%] h-[50vh] w-[60vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(251,146,60,0.12) 0%, transparent 68%)",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: [0, 30, -30, 0],
                y: [0, -25, 15, 0],
                opacity: [0.7, 1, 0.8, 0.7],
              }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Soft secondary orb (mint operational signal) */}
      <motion.div
        className="absolute left-[40%] top-[55%] h-[280px] w-[280px] rounded-full blur-[80px]"
        style={{ background: "rgba(52,211,153,0.07)" }}
        animate={
          reduce
            ? undefined
            : { scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }
        }
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Animated technical grid */}
      <motion.div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 75% 60% at 50% 35%, black 15%, transparent 72%)",
        }}
        animate={
          reduce
            ? undefined
            : { backgroundPosition: ["0px 0px", "64px 64px"] }
        }
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      />

      {/* Horizontal scan line (very subtle) */}
      {!reduce && (
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"
          style={{ top: "30%" }}
          animate={{ top: ["12%", "78%", "12%"], opacity: [0, 0.5, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Floating particles */}
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
          }}
          animate={{
            y: [0, -18, 0],
            opacity: [p.opacity * 0.5, p.opacity, p.opacity * 0.5],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Edge vignette — keeps type readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 85% 75% at 50% 40%, transparent 40%, rgba(9,8,7,0.55) 100%)",
        }}
      />
    </div>
  );
}
