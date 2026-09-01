"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

const GLYPHS = "ABCDEFGHKLMNPQRSTUVWXYZ0123456789·%$#/+";

type ScrambleTextProps = {
  text: string;
  className?: string;
  delay?: number;
  tickMs?: number;
};

/**
 * Efecto "decodificación": el texto se revela carácter a carácter
 * con glifos aleatorios. Uso moderado (hero), compatible con lectores
 * de pantalla vía aria-label y respeta prefers-reduced-motion.
 */
export default function ScrambleText({
  text,
  className,
  delay = 0,
  tickMs = 30,
}: ScrambleTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let progress = 0;

    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        progress += 1;
        const revealed = Math.floor(progress);

        if (revealed >= text.length) {
          setDisplay(text);
          if (interval) clearInterval(interval);
          return;
        }

        setDisplay(
          text
            .split("")
            .map((char, i) => {
              if (i < revealed || char === " " || char === "." || char === "·") {
                return char;
              }
              return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            })
            .join(""),
        );
      }, tickMs);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [inView, reduce, text, delay, tickMs]);

  return (
    <span ref={ref} aria-label={text} className={className}>
      <span aria-hidden>{display}</span>
    </span>
  );
}
