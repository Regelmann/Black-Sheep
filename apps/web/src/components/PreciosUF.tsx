"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";

if (typeof window !== "undefined") {
  gsap.registerPlugin(Flip);
}

/**
 * PreciosUF
 *
 * Corrige el modelo de precio: es POR EMPRESA (por tramo de cantidad de
 * vendedores), no por vendedor. Los montos en pesos no cambian respecto al
 * sitio actual — ya correspondían exactamente a este cálculo (6 UF y 10 UF
 * planos a 10/12 meses); lo que estaba mal era la etiqueta "/ vendedor".
 *
 * Al togglear Mensual/Anual, las tarjetas animan con FLIP (GSAP): se mide el
 * estado antes del cambio de precio y se anima hacia el estado nuevo, en vez
 * de que el número simplemente salte.
 *
 * Reemplaza la sección <section id="precios"> actual.
 */

const UF = 40872; // referencial (Banco Central) — mismo valor que ya muestra el sitio

type Plan = {
  id: string;
  nombre: string;
  rango: string;
  descripcion: string;
  ufMensual: number | null; // null = a medida
  destacado?: boolean;
  features: string[];
  cta: string;
};

const planes: Plan[] = [
  {
    id: "campo",
    nombre: "Campo",
    rango: "1–3 vendedores",
    descripcion: "Para el equipo que recién sale a terreno.",
    ufMensual: 6,
    features: [
      "App de terreno (Hoy, Mapa, Clientes)",
      "Ruta del día y check-in GPS",
      "Pedidos con precio por cliente",
      "Catálogo web al cliente",
      "1 lista de precios + histórico",
      "Soporte por WhatsApp en horario hábil",
    ],
    cta: "Empezar con Campo →",
  },
  {
    id: "comando",
    nombre: "Comando",
    rango: "4–15 vendedores",
    descripcion: "Operación completa: terreno + gerencia.",
    ufMensual: 10,
    destacado: true,
    features: [
      "Todo lo de Campo",
      "Next-Best-Action y focos diarios",
      "Alertas de fuga y reposición",
      "3 listas + acuerdos por cliente",
      "Gerencia y tablero en vivo",
      "Sync ERP / API y onboarding acompañado",
    ],
    cta: "Elegir Comando →",
  },
  {
    id: "enterprise",
    nombre: "Enterprise",
    rango: "16 o más vendedores",
    descripcion: "Múltiples equipos, zonas o marcas bajo un mismo control.",
    ufMensual: null,
    features: [
      "Todo lo de Comando",
      "Múltiples equipos y zonas",
      "SLA y soporte prioritario",
      "Integraciones a medida",
    ],
    cta: "Conversar cotización →",
  },
];

function pesos(n: number) {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export default function PreciosUF() {
  const [billing, setBilling] = useState<"mensual" | "anual">("mensual");
  const cardsRef = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);

  function toggleBilling(next: "mensual" | "anual") {
    if (next === billing) return;
    if (cardsRef.current) {
      flipState.current = Flip.getState(
        cardsRef.current.querySelectorAll(".bs-price-value, .bs-price-note")
      );
    }
    setBilling(next);
  }

  useLayoutEffect(() => {
    if (flipState.current) {
      Flip.from(flipState.current, {
        duration: 0.5,
        ease: "power2.inOut",
        scale: true,
        absolute: true,
      });
      flipState.current = null;
    }
  }, [billing]);

  return (
    <section className="bs-precios" id="precios">
      <div className="bs-precios-head">
        <span className="bs-eyebrow">Precios</span>
        <h2>Claro en UF. Por empresa, no por vendedor.</h2>
        <p>
          Un precio por tramo de equipo, sin sorpresas al sumar gente. UF referencial{" "}
          {pesos(UF)} (Banco Central). El monto en pesos se actualiza con la UF del día
          de facturación.
        </p>

        <div className="bs-toggle" role="tablist" aria-label="Ciclo de facturación">
          <button
            role="tab"
            aria-selected={billing === "mensual"}
            className={billing === "mensual" ? "active" : ""}
            onClick={() => toggleBilling("mensual")}
          >
            Mensual
          </button>
          <button
            role="tab"
            aria-selected={billing === "anual"}
            className={billing === "anual" ? "active" : ""}
            onClick={() => toggleBilling("anual")}
          >
            Anual −2 meses
          </button>
        </div>
      </div>

      <div className="bs-price-cards" ref={cardsRef}>
        {planes.map((p) => {
          const esCustom = p.ufMensual === null;
          const mensualPesos = !esCustom ? p.ufMensual! * UF : null;
          const anualEquivalente = !esCustom ? (p.ufMensual! * 10 * UF) / 12 : null;
          const ahorroAnual = !esCustom ? p.ufMensual! * 2 * UF : null;
          const mostrado = billing === "mensual" ? mensualPesos : anualEquivalente;

          return (
            <div key={p.id} className={`bs-price-card ${p.destacado ? "destacado" : ""}`}>
              {p.destacado && <span className="bs-badge">Más elegido</span>}
              <div className="bs-plan-rango">{p.rango}</div>
              <h3>{p.nombre}</h3>
              <p className="bs-plan-desc">{p.descripcion}</p>

              {esCustom ? (
                <div className="bs-price-value">A medida</div>
              ) : (
                <>
                  <div className="bs-price-value">
                    {p.ufMensual} UF
                    <span className="bs-price-unit">/ mes, por empresa</span>
                  </div>
                  <div className="bs-price-note">
                    ≈ {pesos(mostrado!)} /mes
                    {billing === "anual" ? " (facturación anual)" : ""}
                  </div>
                  {billing === "anual" && (
                    <div className="bs-price-save">
                      Equivale a 10 meses · ahorrás {pesos(ahorroAnual!)} al año
                    </div>
                  )}
                </>
              )}

              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <span className="bs-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <a href="#demo" className="bs-price-cta">
                {p.cta}
              </a>
            </div>
          );
        })}
      </div>

      <p className="bs-price-footnote">
        Comparativa mercado field sales 2026: Badger ~USD 58–69, SalesRabbit ~USD
        49–75, Map My Customers desde USD 99 — precios por vendedor. Nuestros planes
        son por empresa, en UF, y se cotizan en pesos al valor UF del día.
      </p>

      <style jsx>{`
        .bs-precios {
          padding: 6rem 6vw;
          background: #050705;
        }
        .bs-precios-head {
          max-width: 60ch;
          margin: 0 auto 3rem;
          text-align: center;
        }
        .bs-eyebrow {
          color: #39ff14;
          font-size: 0.8rem;
          letter-spacing: 0.02em;
        }
        .bs-precios-head h2 {
          font-size: clamp(1.6rem, 3.2vw, 2.3rem);
          margin: 0.5rem 0 0.8rem;
          font-weight: 650;
          color: #eafbea;
        }
        .bs-precios-head p {
          color: #8fa38f;
          font-size: 0.95rem;
          line-height: 1.55;
          margin: 0 0 1.6rem;
        }
        .bs-toggle {
          display: inline-flex;
          border: 1px solid rgba(57, 255, 20, 0.25);
          border-radius: 999px;
          padding: 0.25rem;
          gap: 0.25rem;
        }
        .bs-toggle button {
          border: none;
          background: transparent;
          color: #8fa38f;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          cursor: pointer;
        }
        .bs-toggle button.active {
          background: rgba(57, 255, 20, 0.12);
          color: #39ff14;
        }
        .bs-price-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          max-width: 1100px;
          margin: 0 auto;
        }
        .bs-price-card {
          position: relative;
          border: 1px solid rgba(57, 255, 20, 0.18);
          border-radius: 20px;
          padding: 2rem 1.8rem;
          background: linear-gradient(160deg, #0d130d, #070a07 70%);
          color: #eafbea;
          display: flex;
          flex-direction: column;
        }
        .bs-price-card.destacado {
          border-color: rgba(57, 255, 20, 0.55);
          box-shadow: 0 0 40px rgba(57, 255, 20, 0.08);
        }
        .bs-badge {
          position: absolute;
          top: -0.7rem;
          left: 1.8rem;
          background: #39ff14;
          color: #04140a;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.25rem 0.7rem;
          border-radius: 999px;
        }
        .bs-plan-rango {
          font-size: 0.72rem;
          color: #39ff14;
          letter-spacing: 0.02em;
          margin-bottom: 0.4rem;
        }
        .bs-price-card h3 {
          font-size: 1.3rem;
          margin: 0 0 0.4rem;
          font-weight: 650;
        }
        .bs-plan-desc {
          color: #8fa38f;
          font-size: 0.85rem;
          margin: 0 0 1.3rem;
        }
        .bs-price-value {
          font-size: 2rem;
          font-weight: 700;
          display: flex;
          align-items: baseline;
          gap: 0.4rem;
        }
        .bs-price-unit {
          font-size: 0.72rem;
          font-weight: 500;
          color: #8fa38f;
        }
        .bs-price-note {
          font-size: 0.8rem;
          color: #8fa38f;
          margin-top: 0.3rem;
        }
        .bs-price-save {
          font-size: 0.78rem;
          color: #39ff14;
          margin-top: 0.3rem;
        }
        .bs-price-card ul {
          list-style: none;
          padding: 0;
          margin: 1.5rem 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          flex: 1;
        }
        .bs-price-card li {
          display: flex;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: #cfe8cf;
        }
        .bs-check {
          color: #39ff14;
        }
        .bs-price-cta {
          text-align: center;
          text-decoration: none;
          border-radius: 999px;
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
          font-weight: 650;
          background: #39ff14;
          color: #04140a;
        }
        .bs-price-card:not(.destacado) .bs-price-cta {
          background: transparent;
          color: #39ff14;
          border: 1px solid rgba(57, 255, 20, 0.4);
        }
        .bs-price-footnote {
          max-width: 70ch;
          margin: 2.5rem auto 0;
          text-align: center;
          color: #5c6e5c;
          font-size: 0.75rem;
          line-height: 1.5;
        }
      `}</style>
    </section>
  );
}
