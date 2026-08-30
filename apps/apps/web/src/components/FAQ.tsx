"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Reveal from "@/components/Reveal";

const QA = [
  {
    q: "¿Necesito instalar algo o comprar equipos especiales?",
    a: "No. Black Sheep Field funciona en el navegador para la oficina y como app móvil (Android e iOS) para el vendedor. Si tu equipo tiene un celular del 2019 en adelante, ya está todo listo.",
  },
  {
    q: "¿Puedo cargar mis clientes y precios desde Excel?",
    a: "Sí, y es lo más común. Tenemos un importador asistido de clientes, listas de precios y acuerdos. En el plan Equipo además te acompañamos con la migración completa durante la primera semana.",
  },
  {
    q: "¿Funciona sin señal? Mis vendedores van a sectores sin cobertura.",
    a: "Sí. El modo offline es de verdad: el vendedor toma pedidos, revisa acuerdos y registra visitas sin internet, y todo se sincroniza automáticamente cuando recupera señal. Cero pedidos perdidos en zona rural.",
  },
  {
    q: "¿Se integra con mi sistema de facturación o ERP?",
    a: "Tenemos conectores listos para los sistemas más usados en Chile (Softland, Defontana, entre otros) y una API abierta con webhooks para integraciones propias. En la demo revisamos tu caso específico.",
  },
  {
    q: "¿Cuánto demora partir? ¿Y si el equipo no es tecnológico?",
    a: "Un equipo típico está operando en dos semanas: semana 1 de carga de datos y configuración, semana 2 de vendedores vendiendo en terreno. La app está diseñada para gente de calle — tres toques y el pedido está tomado.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative w-full">
      <div className="mx-auto w-full max-w-4xl px-6 py-24">
        <Reveal className="space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            FAQ
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Lo que siempre <span className="text-gradient">nos preguntan</span>
          </h2>
        </Reveal>

        <div className="mt-12 space-y-3">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 0.05}>
                <div
                  className={`overflow-hidden rounded-2xl border transition-colors duration-300 ${
                    isOpen
                      ? "border-primary/40 bg-card/70"
                      : "border-line/50 bg-card/35 hover:border-line"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="font-display text-sm font-bold text-white sm:text-base">
                      {item.q}
                    </span>
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-all duration-300 ${
                        isOpen
                          ? "rotate-180 border-primary/40 bg-primary/15 text-primary-soft"
                          : "border-line/60 text-ink"
                      }`}
                    >
                      <ChevronDown size={15} />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="px-6 pb-6 text-sm leading-relaxed text-ink">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
