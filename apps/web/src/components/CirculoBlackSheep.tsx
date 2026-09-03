"use client";

import { useState } from "react";

const PASOS = [
  { id: "datos", tag: "Datos", body: "Ventas · stock · cartera · precios" },
  { id: "inteligencia", tag: "Inteligencia", body: "Quién comprar · qué ofrecer · a qué precio · cuándo visitar" },
  { id: "vendedor", tag: "Vendedor", body: "Hoy · ruta · cliente · pedido" },
  { id: "cliente", tag: "Cliente", body: "Catálogo personalizado · precios propios · stock · recompra" },
  { id: "pedido", tag: "Pedido", body: "Pedido confirmado · operación · seguimiento" },
  { id: "gerencia", tag: "Gerencia", body: "Venta · meta · margen · equipo · canales · oportunidades" },
];

export default function CirculoBlackSheep() {
  const [activo, setActivo] = useState(0);

  return (
    <section id="circulo" className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold tracking-[0.22em] text-primary uppercase">
            Cómo funciona
          </p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
            Del dato al pedido.
            <span className="block text-primary">Del pedido a la decisión.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink sm:text-base">
            No competimos contra un CRM. Competimos contra Excel + WhatsApp +
            mapas + planillas + memoria del gerente — y los unificamos.
          </p>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-2">
          {PASOS.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActivo(i)}
              className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                activo === i
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
              }`}
            >
              {p.tag}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-[10px] font-bold tracking-[0.18em] text-primary uppercase">
            {String(activo + 1).padStart(2, "0")} · {PASOS[activo].tag}
          </p>
          <p className="mt-2 text-sm text-white/80">{PASOS[activo].body}</p>
        </div>

        <p className="mt-6 text-center text-xs text-white/35">
          Decisión → vuelve a Datos. El círculo no termina, se repite cada día.
        </p>
      </div>
    </section>
  );
}
