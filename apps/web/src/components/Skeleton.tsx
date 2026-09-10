"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Bloque shimmer reutilizable */
export function Skeleton({
  className = "",
  rounded = "xl",
}: {
  className?: string;
  rounded?: "md" | "xl" | "full";
}) {
  const reduce = useReducedMotion();
  const radius =
    rounded === "full" ? "rounded-full" : rounded === "md" ? "rounded-md" : "rounded-xl";

  return (
    <div
      className={`relative overflow-hidden bg-card/60 ${radius} ${className}`}
      aria-hidden
    >
      {!reduce && (
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/8 to-transparent"
          animate={{ translateX: ["-100%", "100%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      )}
    </div>
  );
}

/** Skeleton de card de producto / pricing */
export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line/50 bg-card/40 p-4">
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="h-3 w-2/3" rounded="md" />
      <Skeleton className="h-3 w-1/2" rounded="md" />
      <Skeleton className="mt-2 h-9 w-full" rounded="md" />
    </div>
  );
}

/** Grid de skeletons mientras hidrata una sección */
export function SectionSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 py-16 sm:grid-cols-3">
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
