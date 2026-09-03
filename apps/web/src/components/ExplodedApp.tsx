"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * ExplodedApp
 * Sección "Por dentro": la app se desarma en capas (Z real) al hacer scroll.
 * Pin de sección + timeline única controlada por scrub. Respeta prefers-reduced-motion
 * (en ese caso muestra el stack ya desplegado, sin pin ni scrub).
 *
 * Uso:
 *   import ExplodedApp from "@/components/ExplodedApp";
 *   ...
 *   <ExplodedApp />
 */
export default function ExplodedApp() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set(".bs-layer-mapa", { z: 40, y: -20 });
        gsap.set(".bs-layer-pedido", { z: 20, y: 10 });
        gsap.set(".bs-layer-gerencia", { z: 0, y: 40 });
        gsap.set(".bs-layer-sync", { z: -20, y: 70 });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=140%",
          pin: true,
          scrub: 1,
        },
      });

      tl.to(".bs-layer-hoy", { z: 150, y: -100, rotateX: 8, duration: 1 }, 0)
        .to(".bs-layer-mapa", { z: 95, y: -40, rotateX: 5, duration: 1 }, 0.12)
        .to(".bs-layer-pedido", { z: 45, y: 15, rotateX: 2, duration: 1 }, 0.24)
        .to(".bs-layer-gerencia", { z: 5, y: 65, rotateX: -1, duration: 1 }, 0.36)
        .to(".bs-layer-sync", { z: -40, y: 105, rotateX: -3, duration: 1 }, 0.48)
        .fromTo(
          ".bs-callout",
          { opacity: 0, x: -10 },
          { opacity: 1, x: 0, stagger: 0.08, duration: 0.6 },
          0.25
        )
        .to(".bs-callout", { opacity: 0, duration: 0.4 }, 0.92);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bs-explode-wrap" id="por-dentro">
      <div className="bs-explode-head">
        <span className="bs-eyebrow">Por dentro</span>
        <h2>La app, en capas</h2>
        <p>
          Al bajar, cada capa se separa en profundidad real. Al subir, vuelve a
          armarse.
        </p>
      </div>

      <div className="bs-stack" ref={stackRef}>
        <div className="bs-layer bs-layer-hoy">
          <span className="bs-tag">HOY</span>
          <div className="bs-title">Reponer stock — Cliente Premium</div>
          <div className="bs-pill">Next-best-action · vence hoy 18:00</div>
          <div className="bs-row">
            <span>Visitas</span>
            <span className="bs-accent">6/9</span>
          </div>
          <div className="bs-row">
            <span>Venta del día</span>
            <span className="bs-accent">$412.000</span>
          </div>
        </div>

        <div className="bs-layer bs-layer-mapa">
          <span className="bs-tag">MAPA</span>
          <div className="bs-title">Ruta optimizada</div>
          <div className="bs-pill">4 paradas restantes · 12 min entre visitas</div>
          <div className="bs-row">
            <span>Hecho</span>
            <span className="bs-accent">2</span>
          </div>
          <div className="bs-row">
            <span>Ahora</span>
            <span className="bs-accent">Local Ñuñoa</span>
          </div>
        </div>

        <div className="bs-layer bs-layer-pedido">
          <span className="bs-tag">PEDIDO</span>
          <div className="bs-title">Armar pedido</div>
          <div className="bs-pill">Lista + precio cliente · stock disponible</div>
          <div className="bs-row">
            <span>Total</span>
            <span className="bs-accent">18 UF</span>
          </div>
          <div className="bs-row">
            <span>Acuerdo</span>
            <span className="bs-accent">30 días</span>
          </div>
        </div>

        <div className="bs-layer bs-layer-gerencia">
          <span className="bs-tag">GERENCIA</span>
          <div className="bs-title">MTD &amp; focos</div>
          <div className="bs-pill">Fuga de cliente detectada · 21 días sin pedir</div>
          <div className="bs-row">
            <span>Equipo</span>
            <span className="bs-accent">92% meta</span>
          </div>
        </div>

        <div className="bs-layer bs-layer-sync">
          <span className="bs-tag">SYNC</span>
          <div className="bs-title">Offline → nube</div>
          <div className="bs-pill">Todo se guarda sin señal y sincroniza al conectar</div>
          <div className="bs-row">
            <span>Estado</span>
            <span className="bs-accent">Al día</span>
          </div>
        </div>

        <span className="bs-callout bs-callout-hoy">Foco prioritario</span>
        <span className="bs-callout bs-callout-mapa">Ruta del día</span>
        <span className="bs-callout bs-callout-pedido">Precio por empresa</span>
        <span className="bs-callout bs-callout-gerencia">Riesgo de fuga</span>
      </div>

      <style jsx>{`
        .bs-explode-wrap {
          position: relative;
          /* 🔴 SE VEÍA QUEBRADO:
             height:100vh + overflow:hidden con capas de 640px que se
             separan hasta 105px hacia abajo. En un portátil de 800px
             de alto la pila no entra y las capas quedan cortadas por
             el borde. min-height + padding le dan aire real. */
          min-height: 100vh;
          padding: 7rem 0 5rem;
          perspective: 1400px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(
              60% 50% at 50% 20%,
              rgba(57, 255, 20, 0.08),
              transparent 60%
            ),
            #050705;
          overflow: hidden;
        }
        .bs-explode-head {
          position: absolute;
          top: 4.5rem;
          left: 6vw;
          max-width: 30ch;
        }
        .bs-eyebrow {
          color: #39ff14;
          font-size: 0.8rem;
          letter-spacing: 0.02em;
          display: block;
          margin-bottom: 0.4rem;
        }
        .bs-explode-head h2 {
          font-size: clamp(1.5rem, 3vw, 2.1rem);
          margin: 0 0 0.6rem;
          font-weight: 650;
          color: #eafbea;
        }
        .bs-explode-head p {
          color: #8fa38f;
          font-size: 0.95rem;
          line-height: 1.5;
          margin: 0;
        }
        .bs-stack {
          position: relative;
          width: min(300px, 70vw);
          /* La pila escala con el alto de la ventana en vez de estar
             fija en 640px. Así entra completa en cualquier pantalla. */
          height: min(560px, 62vh);
          transform-style: preserve-3d;
        }
        @media (max-width: 900px) {
          /* En móvil el efecto 3D se lee mal y come rendimiento:
             las capas se apilan planas, que es más legible. */
          .bs-explode-wrap { perspective: none; padding: 5rem 0 4rem; }
          .bs-stack { height: min(480px, 58vh); }
        }
        .bs-layer {
          position: absolute;
          inset: 0;
          border-radius: 28px;
          border: 1px solid rgba(57, 255, 20, 0.18);
          background: linear-gradient(160deg, #0d130d, #070a07 70%);
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55),
            inset 0 0 40px rgba(57, 255, 20, 0.03);
          padding: 1.4rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          color: #eafbea;
          will-change: transform;
        }
        .bs-tag {
          align-self: flex-start;
          font-size: 0.65rem;
          letter-spacing: 0.03em;
          color: #39ff14;
          border: 1px solid rgba(57, 255, 20, 0.18);
          border-radius: 999px;
          padding: 0.25rem 0.6rem;
        }
        .bs-title {
          font-size: 1.05rem;
          font-weight: 650;
        }
        .bs-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #8fa38f;
          border-top: 1px dashed rgba(255, 255, 255, 0.08);
          padding-top: 0.5rem;
        }
        .bs-pill {
          border-radius: 12px;
          background: rgba(57, 255, 20, 0.07);
          border: 1px solid rgba(57, 255, 20, 0.18);
          padding: 0.7rem 0.8rem;
          font-size: 0.82rem;
        }
        .bs-accent {
          color: #39ff14;
          font-weight: 650;
        }
        .bs-layer-hoy {
          z-index: 5;
        }
        .bs-layer-mapa {
          z-index: 4;
        }
        .bs-layer-pedido {
          z-index: 3;
        }
        .bs-layer-gerencia {
          z-index: 2;
        }
        .bs-layer-sync {
          z-index: 1;
        }
        .bs-callout {
          position: absolute;
          font-size: 0.72rem;
          color: #39ff14;
          background: rgba(5, 7, 5, 0.85);
          border: 1px solid rgba(57, 255, 20, 0.18);
          border-radius: 999px;
          padding: 0.3rem 0.7rem;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
        }
        .bs-callout-hoy {
          top: 8%;
          left: -34%;
        }
        .bs-callout-mapa {
          top: 30%;
          right: -38%;
        }
        .bs-callout-pedido {
          top: 52%;
          left: -40%;
        }
        .bs-callout-gerencia {
          top: 74%;
          right: -36%;
        }
        @media (max-width: 640px) {
          .bs-callout {
            display: none;
          }
          .bs-explode-head {
            position: static;
            max-width: 100%;
            text-align: center;
            margin-bottom: 2rem;
          }
          .bs-explode-wrap {
            height: auto;
            padding: 4rem 6vw;
            flex-direction: column;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bs-callout {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
