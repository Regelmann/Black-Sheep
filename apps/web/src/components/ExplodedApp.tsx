"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const LAYERS = [
  { id: "hoy", tag: "Hoy", title: "El día ya viene armado", body: "Foco prioritario, visitas y venta. El vendedor abre y sabe qué hacer.", metric: "6/9 visitas", accent: "$4,2M" },
  { id: "mapa", tag: "Ruta", title: "Kilómetros con sentido", body: "Orden por potencial, urgencia de reposición y distancia — no por costumbre.", metric: "74 km", accent: "9 paradas" },
  { id: "pedido", tag: "Pedido", title: "Precio correcto, stock real", body: "Lista + acuerdo del cliente. Carrito en segundos, directo a bodega.", metric: "40 seg", accent: "sin Excel" },
  { id: "gerencia", tag: "Gerencia", title: "Fuga antes de que sea tarde", body: "Alertas de ritmo y volumen. La jefatura ve el terreno en vivo.", metric: "−24%", accent: "alerta" },
  { id: "sync", tag: "Sync", title: "Sin señal, sin perder nada", body: "Cola offline con reintentos. Cuando vuelve la red, todo sube solo.", metric: "idempotente", accent: "al día" },
];

export default function ExplodedApp() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch =
      window.matchMedia("(hover: none), (pointer: coarse)").matches ||
      window.innerWidth < 900;
    if (reduced || isTouch) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".bs-layer-card");
      if (!cards.length) return;
      gsap.set(cards, { y: 40, autoAlpha: 0.35, scale: 0.96 });
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=160%",
          pin: true,
          scrub: 0.85,
          anticipatePin: 1,
        },
      });
      cards.forEach((card, i) => {
        tl.to(card, { y: -i * 18, autoAlpha: 1, scale: 1, duration: 1, ease: "power2.out" }, i * 0.15);
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="por-dentro"
      className="relative overflow-hidden border-y border-white/[0.06] bg-[#050505] py-20 md:min-h-[100vh] md:py-0"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(57,255,20,0.07),transparent_55%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 md:min-h-[100vh] md:grid-cols-2 md:items-center md:py-24">
        <div className="max-w-md">
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary uppercase">Por dentro</p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
            Una sola app.
            <span className="block text-primary">Cinco capas que cierran el día.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink sm:text-base">
            No es un catálogo de features. Es el flujo real del vendedor y de la gerencia — el mismo que ven en el teléfono a las 07:45.
          </p>
          <ul className="mt-8 space-y-3">
            {["Ruta con sentido comercial", "Precio por cliente, no por planilla", "Pedidos que llegan bien a bodega"].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-[380px] space-y-3 md:h-[520px] md:space-y-0">
          {LAYERS.map((L, i) => (
            <article
              key={L.id}
              className="bs-layer-card relative rounded-2xl border border-white/10 bg-gradient-to-br from-[#121212] to-[#0a0a0a] p-4 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.9)] md:absolute md:inset-x-0 md:top-0"
              style={{ zIndex: LAYERS.length - i, transform: `translateY(${i * 12}px)` }}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-primary uppercase">{L.tag}</span>
                <span className="text-[10px] font-semibold text-white/35">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-lg font-bold text-white">{L.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink">{L.body}</p>
              <div className="mt-4 flex items-center gap-3 border-t border-white/[0.06] pt-3">
                <span className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-white/70">{L.metric}</span>
                <span className="text-[11px] font-bold text-primary">{L.accent}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
