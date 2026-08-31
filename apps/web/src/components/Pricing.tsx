"use client";

import { ArrowRight, Check, Sparkles } from "lucide-react";
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import Reveal from "@/components/Reveal";

const PLANS = [
  {
    name: "Emprendedor",
    price: "$19.990",
    note: "+ IVA · por vendedor/mes",
    description: "Para el primero que sale a la calle con la app en la mano.",
    cta: "Empezar ahora",
    featured: false,
    features: [
      "1 vendedor en terreno",
      "Clientes y ruta del día",
      "Toma de pedidos con fotos",
      "Lista de precios única",
      "Soporte por correo",
    ],
  },
  {
    name: "Equipo",
    price: "$34.990",
    note: "+ IVA · por vendedor/mes",
    description: "La operación completa que ordena una fuerza de ventas real.",
    cta: "Elegir Equipo",
    featured: true,
    features: [
      "Hasta 15 vendedores",
      "Next-Best-Action y focos diarios",
      "Alertas de fuga y recurrencia",
      "3 listas + acuerdos por cliente",
      "Sync con tu ERP y reportes gerenciales",
      "Soporte humano en menos de 4 h",
    ],
  },
  {
    name: "Corporativo",
    price: "A medida",
    note: "implementación acompañada",
    description: "Multi-bodega, multi-marca y las exigencias de tu área de TI.",
    cta: "Hablar con ventas",
    featured: false,
    features: [
      "Vendedores ilimitados",
      "Multi-bodega y multi-marca",
      "API, webhooks y SSO",
      "Migración de datos incluida",
      "Gerente de cuenta dedicado",
      "SLA y acuerdos empresariales",
    ],
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.08 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 48, scale: 0.94 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 280, damping: 24, mass: 0.9 },
  },
};

const featureListVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.15 } },
};

const featureItemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: EASE },
  },
};

export default function Pricing() {
  const reduce = useReducedMotion();

  return (
    <section id="precios" className="relative w-full overflow-hidden">
      {/* Glow detrás del plan destacado */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-primary/20 blur-[120px]"
        animate={
          reduce
            ? undefined
            : { scale: [1, 1.12, 1], opacity: [0.45, 0.75, 0.45] }
        }
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Precios
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Precios claros, en pesos,
            <br />
            <span className="text-gradient">sin letra chiquita</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Partes con lo que tu equipo necesita hoy y creces cuando la ruta lo
            pida. Todos los planes incluyen app móvil y acompañamiento en
            español.
          </p>
        </Reveal>

        <motion.div
          className="mt-16 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3 lg:items-center"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px", amount: 0.2 }}
          variants={reduce ? undefined : gridVariants}
        >
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} reduce={!!reduce} />
          ))}
        </motion.div>

        <Reveal delay={0.2} className="mt-10 text-center text-xs text-ink/70">
          ¿Más de 20 vendedores o varias marcas?{" "}
          <a
            href="#demo"
            className="font-semibold text-primary-soft underline-offset-4 hover:underline"
          >
            Armemos una operación a tu medida
          </a>
        </Reveal>
      </div>
    </section>
  );
}

type Plan = (typeof PLANS)[number];

function PlanCard({ plan, reduce }: { plan: Plan; reduce: boolean }) {
  return (
    <motion.div
      variants={reduce ? undefined : cardVariants}
      whileHover={
        reduce
          ? undefined
          : plan.featured
            ? { y: -14, scale: 1.03 }
            : { y: -10, scale: 1.02 }
      }
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`relative h-full ${plan.featured ? "z-10 lg:-my-4" : "z-0"}`}
    >
      {/* Anillo animado en plan destacado */}
      {plan.featured && !reduce && (
        <motion.div
          aria-hidden
          className="absolute -inset-[1px] rounded-[1.55rem] bg-gradient-to-b from-primary-soft via-primary to-primary/40"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-8 ${
          plan.featured
            ? "border border-primary/40 bg-card shadow-2xl shadow-primary/25"
            : "border border-line/60 bg-card/45"
        }`}
      >
        {/* Shine sweep on featured */}
        {plan.featured && !reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/8 to-transparent"
            animate={{ translateX: ["-100%", "120%"] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              repeatDelay: 3.2,
              ease: "easeInOut",
            }}
          />
        )}

        {plan.featured && (
          <motion.span
            className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-primary/35 bg-primary/15 px-2.5 py-1 font-display text-[10px] font-black tracking-[0.2em] text-primary-soft uppercase"
            initial={reduce ? false : { scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.25 }}
          >
            <Sparkles size={12} />
            Más elegido
          </motion.span>
        )}

        <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
        <p className="mt-1.5 text-xs leading-snug text-ink">{plan.description}</p>

        <motion.div
          className="mt-6 flex items-end gap-2"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15, duration: 0.45, ease: EASE }}
        >
          <span
            className={`font-display text-4xl font-black tracking-tight ${
              plan.featured ? "text-gradient" : "text-white"
            }`}
          >
            {plan.price}
          </span>
        </motion.div>
        <p className="mt-1 text-[11px] font-medium text-ink/70">{plan.note}</p>

        <motion.a
          href="#demo"
          whileHover={reduce ? undefined : { scale: 1.04 }}
          whileTap={reduce ? undefined : { scale: 0.96 }}
          className={`group relative mt-7 inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3.5 text-sm font-bold ${
            plan.featured
              ? "bg-primary text-black shadow-lg shadow-primary/40"
              : "border border-line/80 bg-navy/60 text-mist hover:border-primary/50 hover:bg-panel"
          }`}
        >
          {plan.featured && !reduce && (
            <motion.span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              animate={{ x: ["-120%", "120%"] }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                repeatDelay: 2.5,
                ease: "easeInOut",
              }}
            />
          )}
          <span className="relative">{plan.cta}</span>
          <ArrowRight
            size={15}
            className="relative transition-transform duration-300 group-hover:translate-x-1"
          />
        </motion.a>

        <motion.ul
          className="mt-8 space-y-3 border-t border-line/50 pt-7"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={reduce ? undefined : featureListVariants}
        >
          {plan.features.map((feature) => (
            <motion.li
              key={feature}
              variants={reduce ? undefined : featureItemVariants}
              className="flex items-start gap-2.5 text-sm text-ink"
            >
              <span
                className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${
                  plan.featured
                    ? "bg-primary/20 text-primary-soft"
                    : "bg-panel text-mint"
                }`}
              >
                <Check size={10} strokeWidth={3} />
              </span>
              {feature}
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </motion.div>
  );
}
