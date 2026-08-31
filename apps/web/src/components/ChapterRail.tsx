"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const CHAPTERS = [
  { id: "terreno", label: "Terreno" },
  { id: "gerencia", label: "Gerencia" },
  { id: "precios", label: "Precios" },
  { id: "demo", label: "Demo" },
] as const;

/**
 * Capítulos fijos al scroll — equivalente a ON TRACK / OFF TRACK de LN.
 */
export default function ChapterRail() {
  const [active, setActive] = useState<string>("terreno");

  useEffect(() => {
    const els = CHAPTERS.map((c) => document.getElementById(c.id)).filter(
      Boolean,
    ) as HTMLElement[];
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -45% 0px", threshold: [0.1, 0.25, 0.5] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="pointer-events-none fixed top-1/2 right-3 z-40 hidden -translate-y-1/2 flex-col gap-3 md:flex">
      {CHAPTERS.map((c) => {
        const on = active === c.id;
        return (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="pointer-events-auto group flex items-center justify-end gap-2"
          >
            <span
              className={`text-[10px] font-bold tracking-[0.18em] uppercase transition ${
                on ? "text-primary" : "text-ink group-hover:text-mist"
              }`}
            >
              {c.label}
            </span>
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              {on && (
                <motion.span
                  layoutId="chapter-dot"
                  className="absolute inset-0 rounded-full bg-primary shadow-[0_0_12px_rgba(57,255,20,0.8)]"
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                />
              )}
              <span
                className={`h-1.5 w-1.5 rounded-full ${on ? "bg-black" : "bg-line"}`}
              />
            </span>
          </a>
        );
      })}
    </div>
  );
}
