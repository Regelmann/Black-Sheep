"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgePercent,
  MapPin,
  RefreshCw,
  Route as RouteIcon,
  ShoppingCart,
  Target,
  TrendingUp,
  Undo2,
  X,
} from "lucide-react";

type ToastEvent = {
  tone: "mint" | "sky" | "rose" | "amber";
  Icon: typeof ShoppingCart;
  title: string;
  meta: string;
};

const EVENTS: ToastEvent[] = [
  { tone: "mint", Icon: ShoppingCart, title: "Pedido $864.200 confirmado", meta: "Botillería San Miguel 26 · hace 40 s" },
  { tone: "sky", Icon: RouteIcon, title: "Ruta completada al 100%", meta: "Zona 2 · 9/9 visitas · hace 2 min" },
  { tone: "mint", Icon: Undo2, title: "Fuga recuperada a tiempo", meta: "Local Providencia volvió a pedir · hace 4 min" },
  { tone: "amber", Icon: BadgePercent, title: "Acuerdo Lista 3 aplicado", meta: "Café Bodega · margen protegido 26% · hace 5 min" },
  { tone: "sky", Icon: RefreshCw, title: "Sync con ERP completada", meta: "214 SKUs y 3 listas actualizadas · hace 6 min" },
  { tone: "mint", Icon: Target, title: "Próxima acción ejecutada: +$410.000", meta: "Reposición SKU 0884 · Restaurante Aurora · hace 7 min" },
  { tone: "rose", Icon: TrendingUp, title: "Alerta: quiebre de ritmo", meta: "Panadería Central Ñuñoa · hace 8 min" },
  { tone: "mint", Icon: MapPin, title: "Nuevo prospecto detectado", meta: "Zona Estación Central · hace 9 min" },
];

const TONE_CLASSES: Record<ToastEvent["tone"], string> = {
  mint: "border-mint/30 bg-mint/12 text-mint",
  sky: "border-sky/30 bg-sky/12 text-sky",
  rose: "border-rose/30 bg-rose/12 text-rose",
  amber: "border-amber/30 bg-amber/12 text-amber",
};

const FIRST_MS = 6500;
const VISIBLE_MS = 5400;
const GAP_MS = 5200;

/** Notificaciones vivas de la operación (esquina inferior izquierda). */
export default function LiveToasts() {
  const [visible, setVisible] = useState<number | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const lastIndex = useRef(-1);
  const stopped = useRef(false);

  useEffect(() => {
    const schedule = (delay: number) => {
      const t = setTimeout(() => {
        if (stopped.current) return;
        if (document.hidden) {
          schedule(4000);
          return;
        }
        let next = Math.floor(Math.random() * EVENTS.length);
        if (next === lastIndex.current) next = (next + 3) % EVENTS.length;
        lastIndex.current = next;
        setVisible(next);

        const hide = setTimeout(() => {
          setVisible(null);
          schedule(GAP_MS);
        }, VISIBLE_MS);
        timers.current.push(hide);
      }, delay);
      timers.current.push(t);
    };

    schedule(FIRST_MS);
    return () => {
      stopped.current = true;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const event = visible !== null ? EVENTS[visible] : null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-5 z-40 hidden w-[320px] sm:block"
    >
      <AnimatePresence mode="wait">
        {event && (
          <motion.div
            key={`${visible}-${event.title}`}
            initial={{ x: -28, opacity: 0, filter: "blur(6px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: -22, opacity: 0, filter: "blur(5px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line/70 bg-navy/90 p-3.5 pr-3 shadow-2xl backdrop-blur-xl"
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${TONE_CLASSES[event.tone]}`}
            >
              <event.Icon size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">
                {event.title}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-ink">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-mint opacity-70" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-mint" />
                </span>
                {event.meta}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVisible(null)}
              aria-label="Cerrar notificación"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink/60 transition hover:bg-panel hover:text-white"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
