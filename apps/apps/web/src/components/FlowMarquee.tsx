"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import { Sparkles } from "lucide-react";

type FlowMarqueeProps = {
  items?: string[];
  reverse?: boolean;
};

const DEFAULT_ITEMS = ["Ruta", "Precio", "Pedido", "Sync", "Terreno"];

/**
 * Tipografía cinética atada al scroll: la banda avanza con la página
 * y se inclina (skew) según la velocidad de desplazamiento.
 */
export default function FlowMarquee({
  items = DEFAULT_ITEMS,
  reverse = false,
}: FlowMarqueeProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(velocity, {
    stiffness: 320,
    damping: 55,
    mass: 0.8,
  });

  const x = useTransform(
    scrollYProgress,
    [0, 1],
    reverse ? ["-34%", "6%"] : ["6%", "-34%"],
  );
  const skewX = useTransform(smoothVelocity, [-1600, 0, 1600], [4.5, 0, -4.5]);
  const appliedSkew = reduce ? 0 : skewX;
  const appliedX = reduce ? 0 : x;

  return (
    <div
      ref={ref}
      aria-hidden
      className="mask-marquee relative w-full overflow-hidden border-y border-line/40 bg-navy-deep/50 py-14"
    >
      <motion.div
        style={{ x: appliedX, skewX: appliedSkew }}
        className="flex w-max items-center gap-10 whitespace-nowrap will-change-transform"
      >
        {Array.from({ length: 3 }).map((_, copy) => (
          <div key={copy} className="flex items-center gap-10">
            {items.map((item, i) => (
              <span key={`${item}-${i}`} className="flex items-center gap-10">
                <span
                  className={`font-display text-6xl font-black tracking-tight uppercase md:text-8xl ${
                    i % 2 === 0 ? "text-white" : "text-ghost-outline"
                  }`}
                >
                  {item}
                </span>
                <Sparkles
                  size={26}
                  className="shrink-0 text-primary-soft/70"
                  strokeWidth={2.2}
                />
              </span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
