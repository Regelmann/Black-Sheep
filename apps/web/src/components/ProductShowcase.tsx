"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BadgePercent,
  Check,
  LayoutDashboard,
  MapPin,
  Package,
  Route as RouteIcon,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Reveal from "@/components/Reveal";

/* ------------------------------------------------------------------ */
/* Datos de la demo                                                    */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "ruta", label: "Ruta del día", icon: RouteIcon, caption: "La app ordena las visitas por potencial, urgencia de reposición y kilómetros. El vendedor solo conduce." },
  { id: "precios", label: "Precios y acuerdos", icon: BadgePercent, caption: "Tres listas y acuerdos por cliente siempre al día. El tope de margen protege tu rentabilidad sin llamadas a la oficina." },
  { id: "pedidos", label: "Pedidos", icon: ShoppingCart, caption: "Del carrito a bodega sin doble digitación. Aprobación automática por reglas de margen y crédito." },
  { id: "gerencia", label: "Tablero gerencial", icon: LayoutDashboard, caption: "La operación completa, minuto a minuto: ventas, cumplimiento de meta y alertas que piden decisión." },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STOPS = [
  { n: 1, local: "Minimarket Los Trapenses", zona: "Vitacura", time: "09:20", state: "done" },
  { n: 2, local: "KeyFoods Central", zona: "Providencia", time: "10:05", state: "done" },
  { n: 3, local: "Botillería San Miguel 26", zona: "San Miguel", time: "11:10", state: "current" },
  { n: 4, local: "Almacén El Trébol", zona: "Maipú", time: "12:40", state: "next" },
  { n: 5, local: "Panadería Central", zona: "Ñuñoa", time: "15:15", state: "next" },
  { n: 6, local: "Proveeduría 27", zona: "Quilicura", time: "16:55", state: "next" },
];

const PRICE_ROWS = [
  { name: "Aceite Gourmet 1L", sku: "SKU 0884", l1: "$12.990", l2: "$11.900", l3: "$10.900", deal: true },
  { name: "Arroz Premium 5kg", sku: "SKU 0412", l1: "$9.490", l2: "$8.790", l3: "$8.200", deal: false },
  { name: "Café Grano Selección 1kg", sku: "SKU 0770", l1: "$14.500", l2: "$13.900", l3: "$12.990", deal: false },
  { name: "Atún Lomito 170g (display)", sku: "SKU 0198", l1: "$15.600", l2: "$14.800", l3: "$13.900", deal: false },
];

const ORDER_ITEMS = [
  { name: "Aceite Gourmet 1L", qty: 24, price: 10900 },
  { name: "Café Grano Selección 1kg", qty: 36, price: 12990 },
  { name: "Arroz Premium 5kg", qty: 40, price: 8200 },
];

const SELLER_BARS = [
  { name: "CR", h: 95 },
  { name: "JM", h: 72 },
  { name: "PV", h: 88 },
  { name: "DR", h: 60 },
  { name: "FT", h: 66 },
  { name: "MG", h: 90 },
];

/* ------------------------------------------------------------------ */
/* Paneles                                                             */
/* ------------------------------------------------------------------ */

function RutaPanel() {
  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      {/* Mapa */}
      <div className="relative overflow-hidden rounded-2xl border border-line/50 bg-navy/70 md:order-2">
        <svg viewBox="0 0 520 320" className="h-full w-full">
          <defs>
            <radialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4318ff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#4318ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Grilla de fondo */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 47} y1="0" x2={i * 47} y2="320" stroke="#2b3674" strokeOpacity="0.35" strokeWidth="0.6" />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 46} x2="520" y2={i * 46} stroke="#2b3674" strokeOpacity="0.35" strokeWidth="0.6" />
          ))}

          <motion.path
            d="M60 272 L128 190 L214 216 L272 128 L362 156 L428 74"
            fill="none"
            stroke="#7551ff"
            strokeWidth="2.5"
            strokeDasharray="7 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />

          {[
            { x: 60, y: 272, label: "Base", active: false },
            { x: 128, y: 190, label: "Vitacura", active: false },
            { x: 214, y: 216, label: "Providencia", active: false },
            { x: 272, y: 128, label: "San Miguel", active: true },
            { x: 362, y: 156, label: "Maipú", active: false },
            { x: 428, y: 74, label: "Quilicura", active: false },
          ].map((p, i) => (
            <g key={p.label}>
              {p.active && <circle cx={p.x} cy={p.y} r="26" fill="url(#pinGlow)" />}
              <circle cx={p.x} cy={p.y} r={p.active ? 9 : 6.5} fill={p.active ? "#4318ff" : "#1b2559"} stroke={p.active ? "#a3b1ff" : "#4b60b4"} strokeWidth="1.5" />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">
                {i + 1 === 1 ? "▲" : i}
              </text>
              <text x={p.x} y={p.y - (p.active ? 16 : 13)} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#a3b1cc">
                {p.label}
              </text>
            </g>
          ))}
        </svg>
        <span className="absolute right-3 bottom-3 rounded-lg border border-line/60 bg-navy/90 px-2.5 py-1 font-display text-[10px] font-bold tracking-widest text-ink uppercase">
          74 km · 9 paradas
        </span>
      </div>

      {/* Lista de paradas */}
      <div className="flex min-h-0 flex-col gap-2 overflow-hidden md:order-1">
        {STOPS.map((stop) => (
          <div
            key={stop.n}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              stop.state === "current"
                ? "border-primary/50 bg-primary/12"
                : "border-line/45 bg-navy/55"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg font-display text-[10px] font-black ${
                stop.state === "done"
                  ? "bg-mint/15 text-mint"
                  : stop.state === "current"
                    ? "bg-primary text-[#0c0a09]"
                    : "bg-panel text-ink"
              }`}
            >
              {stop.state === "done" ? <Check size={12} strokeWidth={3.5} /> : stop.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-xs font-bold ${stop.state === "done" ? "text-ink/70" : "text-white"}`}>
                {stop.local}
              </p>
              <p className="flex items-center gap-1 text-[10px] text-ink/70">
                <MapPin size={9} /> {stop.zona}
              </p>
            </div>
            <span className="font-display text-[10px] font-bold text-ink/80 tabular-nums">
              {stop.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreciosPanel() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {["Lista 1 · Mayorista", "Lista 2 · Detalle", "Lista 3 · Acuerdo"].map((chip, i) => (
          <span
            key={chip}
            className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold tracking-wide ${
              i === 2
                ? "border-mint/30 bg-mint/10 text-mint"
                : "border-line/60 bg-navy/60 text-ink"
            }`}
          >
            {chip}
          </span>
        ))}
        <span className="ml-auto rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary-soft">
          Cliente: KeyFoods Central
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line/50">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr] gap-2 border-b border-line/50 bg-navy-deep/80 px-4 py-2.5 text-[9.5px] font-black tracking-widest text-ink/70 uppercase">
          <span>Producto</span>
          <span className="text-right">Lista 1</span>
          <span className="text-right">Lista 2</span>
          <span className="text-right">Tu acuerdo</span>
        </div>
        {PRICE_ROWS.map((row) => (
          <div
            key={row.sku}
            className={`grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr] items-center gap-2 border-b border-line/30 px-4 py-3 last:border-0 ${
              row.deal ? "bg-mint/6" : ""
            }`}
          >
            <div>
              <p className="text-xs font-bold text-white">{row.name}</p>
              <p className="text-[10px] text-ink/60">{row.sku}</p>
            </div>
            <span className="text-right text-xs text-ink line-through decoration-rose/50">
              {row.l1}
            </span>
            <span className="text-right text-xs text-mist/90">{row.l2}</span>
            <span className="text-right font-display text-sm font-black text-mint">
              {row.l3}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line/50 bg-navy/60 px-4 py-3.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-mist">Margen con Lista 3: 26,4%</span>
          <span className="flex items-center gap-1.5 font-bold text-mint">
            <ShieldCheck size={12} /> Dentro del tope mínimo (22%)
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-panel">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "64%" }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
            className="h-1.5 rounded-full bg-gradient-to-r from-mint to-sky"
          />
        </div>
      </div>
    </div>
  );
}

function PedidosPanel() {
  const neto = ORDER_ITEMS.reduce((acc, item) => acc + item.qty * item.price, 0);
  const iva = Math.round(neto * 0.19);
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

  const steps = [
    { label: "Tomado", icon: ShoppingCart, state: "done" },
    { label: "Aprobado", icon: ShieldCheck, state: "done" },
    { label: "En preparación", icon: Package, state: "current" },
    { label: "Despachado", icon: Truck, state: "next" },
  ];

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/50 bg-navy/55">
        <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
          <div>
            <p className="font-display text-sm font-black text-white">Pedido #4821</p>
            <p className="text-[10px] text-ink/70">KeyFoods Central · 10:07 hrs</p>
          </div>
          <span className="rounded-lg border border-mint/30 bg-mint/10 px-2.5 py-1 text-[10px] font-black tracking-widest text-mint uppercase">
            Aprobado automático
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-2">
          {ORDER_ITEMS.map((item) => (
            <div key={item.name} className="flex items-center justify-between border-b border-line/30 py-2.5 last:border-0">
              <div>
                <p className="text-xs font-bold text-mist">{item.name}</p>
                <p className="text-[10px] text-ink/60">
                  {item.qty} un × {fmt(item.price)}
                </p>
              </div>
              <span className="font-display text-xs font-black text-white tabular-nums">
                {fmt(item.qty * item.price)}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-line/50 bg-navy-deep/70 px-4 py-3 text-[11px]">
          <div className="flex justify-between text-ink">
            <span>Neto</span>
            <span className="tabular-nums">{fmt(neto)}</span>
          </div>
          <div className="flex justify-between text-ink">
            <span>IVA 19%</span>
            <span className="tabular-nums">{fmt(iva)}</span>
          </div>
          <div className="flex justify-between font-display text-sm font-black text-white">
            <span>Total</span>
            <span className="tabular-nums">{fmt(neto + iva)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-1 rounded-2xl border border-line/50 bg-navy/40 p-4">
        <p className="mb-3 font-display text-[10px] font-black tracking-[0.22em] text-ink/70 uppercase">
          Estado del pedido
        </p>
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-8 w-8 place-items-center rounded-xl border ${
                  step.state === "done"
                    ? "border-mint/40 bg-mint/12 text-mint"
                    : step.state === "current"
                      ? "border-primary/50 bg-primary/15 text-primary-soft"
                      : "border-line/60 bg-panel/60 text-ink/50"
                }`}
              >
                {step.state === "done" ? <Check size={13} strokeWidth={3} /> : <step.icon size={13} />}
              </span>
              {i < steps.length - 1 && (
                <span className={`my-1 h-4 w-px ${step.state === "done" ? "bg-mint/40" : "bg-line"}`} />
              )}
            </div>
            <div className="pb-2">
              <p className={`text-xs font-bold ${step.state === "next" ? "text-ink/60" : "text-white"}`}>
                {step.label}
              </p>
              {step.state === "current" && (
                <p className="text-[10px] text-primary-soft">Bodega Central · ETA 16:30</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GerenciaPanel() {
  const kpis = [
    { label: "Ventas del mes", value: "$46,8M", delta: "+18%", tone: "text-mint" },
    { label: "Cumplimiento de meta", value: "87%", delta: "día 24", tone: "text-sky" },
    { label: "Visitas hoy", value: "41/52", delta: "en vivo", tone: "text-primary-soft" },
    { label: "Alertas de fuga", value: "3", delta: "acción hoy", tone: "text-rose" },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-line/50 bg-navy/60 px-4 py-3.5">
            <p className="text-[9px] font-black tracking-widest text-ink/70 uppercase">{kpi.label}</p>
            <p className="mt-1 font-display text-xl font-black text-white tabular-nums">{kpi.value}</p>
            <p className={`text-[10px] font-bold ${kpi.tone}`}>{kpi.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col rounded-2xl border border-line/50 bg-navy/55 p-4">
          <p className="font-display text-[10px] font-black tracking-[0.22em] text-ink/70 uppercase">
            Ventas por vendedor · semana
          </p>
          <div className="mt-3 flex flex-1 items-end justify-between gap-3">
            {SELLER_BARS.map((bar, i) => (
              <div key={bar.name} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${bar.h}%` }}
                  transition={{ duration: 0.8, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] }}
                  className={`w-full max-w-11 rounded-t-lg ${
                    bar.h >= 85
                      ? "bg-gradient-to-t from-primary to-mint"
                      : "bg-gradient-to-t from-panel to-primary-soft/70"
                  }`}
                />
                <span className="font-display text-[10px] font-bold text-ink">{bar.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <p className="font-display text-[10px] font-black tracking-[0.22em] text-ink/70 uppercase">
            Alertas que piden decisión
          </p>
          {[
            { text: "−24% volumen · Local Providencia", tone: "text-rose border-rose/25 bg-rose/8" },
            { text: "21 días sin pedir · Macul", tone: "text-amber border-amber/25 bg-amber/8" },
            { text: "Margen bajo tope · Panadería Central", tone: "text-sky border-sky/25 bg-sky/8" },
          ].map((alert) => (
            <div key={alert.text} className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 ${alert.tone}`}>
              <AlertTriangle size={13} className="shrink-0" />
              <p className="text-xs font-bold">{alert.text}</p>
            </div>
          ))}
          <div className="rounded-xl border border-line/50 bg-navy/60 px-3.5 py-3">
            <p className="text-[10px] leading-relaxed text-ink">
              El tablero se actualiza con cada visita. Sin planillas de fin de
              semana — la decisión se toma hoy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<TabId, () => React.ReactElement> = {
  ruta: RutaPanel,
  precios: PreciosPanel,
  pedidos: PedidosPanel,
  gerencia: GerenciaPanel,
};

/* ------------------------------------------------------------------ */
/* Sección                                                             */
/* ------------------------------------------------------------------ */

export default function ProductShowcase() {
  const [active, setActive] = useState<TabId>("ruta");
  const tab = TABS.find((t) => t.id === active)!;
  const Panel = PANELS[active];

  return (
    <section id="producto" className="relative w-full overflow-hidden">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            El producto por dentro
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Míralo funcionar,
            <br />
            <span className="text-gradient">como si fuera lunes en terreno</span>
          </h2>
        </Reveal>

        {/* Tabs */}
        <Reveal delay={0.06}>
          <div className="mx-auto mt-12 flex w-fit max-w-full flex-wrap justify-center gap-1.5 rounded-2xl border border-line/60 bg-navy-deep/80 p-1.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold transition-all duration-300 ${
                  active === id
                    ? "bg-primary text-[#0c0a09] shadow-lg shadow-primary/30"
                    : "text-ink hover:text-white"
                }`}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="relative mx-auto mt-5 h-6 max-w-2xl">
            <AnimatePresence mode="wait">
              <motion.p
                key={active}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 text-center text-xs leading-relaxed text-ink"
              >
                {tab.caption}
              </motion.p>
            </AnimatePresence>
          </div>
        </Reveal>

        {/* Mockup de escritorio */}
        <Reveal delay={0.1}>
          <div className="glow-primary relative mx-auto mt-6 max-w-6xl overflow-hidden rounded-3xl border border-line/70 bg-card/60 backdrop-blur-sm">
            {/* Chrome del navegador */}
            <div className="flex items-center gap-3 border-b border-line/50 bg-navy-deep/80 px-5 py-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-mint/70" />
              </div>
              <span className="mx-auto rounded-lg border border-line/50 bg-navy/80 px-4 py-1 font-display text-[10px] font-bold tracking-widest text-ink">
                app.black-sheep.cl
              </span>
              <span className="hidden items-center gap-1.5 rounded-lg border border-mint/25 bg-mint/10 px-2 py-1 text-[9px] font-black tracking-widest text-mint uppercase sm:flex">
                <span className="h-1 w-1 animate-pulse rounded-full bg-mint" />
                Sync al día
              </span>
            </div>

            <div className="h-[430px] p-4 sm:h-[460px] sm:p-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full"
                >
                  <Panel />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
