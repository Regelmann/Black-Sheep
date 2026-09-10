"use client";

/**
 * HERO — el producto, no un diagrama.
 *
 * QUÉ REEMPLAZA
 * Un grafo de puntitos que se movían y no significaban nada: al pinchar
 * un nodo salía un fondo blanco con texto ilegible. No explicaba el
 * producto ni servía de demo.
 *
 * EL CRITERIO, de las mejores landings B2B de 2026:
 * **"el producto es la demo".** Linear pone su lista de issues en el
 * hero; Loom, la pantalla de grabación; Vercel, un deploy real. Ninguna
 * pone una ilustración abstracta.
 *
 * Esto es la pantalla "Hoy" de la app, con el ciclo real de la jornada:
 * la app arma el día → el vendedor visita → el pedido entra.
 *
 * Rota entre tres estados cada 4 segundos, y respeta reduced-motion.
 */
import { useEffect, useState } from "react";

const clp = (n: number) => "$" + n.toLocaleString("es-CL");

const PASOS = [
  {
    hora: "07:45",
    tag: "RUTA DEL DÍA",
    titulo: "9 paradas ordenadas",
    sub: "Por valor × urgencia ÷ distancia",
    filas: [
      { a: "Restaurante Aurora", b: "Providencia", c: "17 d sin comprar", tono: "warn" },
      { a: "Hotel Bidasoa",      b: "Vitacura",    c: "Repone 6 SKU",     tono: "ok" },
      { a: "Club de Golf",       b: "Vitacura",    c: "Prospecto",        tono: "info" },
    ],
    pie: "74 km · sin planificación manual",
  },
  {
    hora: "09:20",
    tag: "EN LA PUERTA",
    titulo: "Qué ofrecerle hoy",
    sub: "Con su precio, no el de lista",
    filas: [
      { a: "Pechuga de pollo 10 kg", b: "Repone cada 14 d", c: clp(7990), tono: "ok" },
      { a: "Salsa Cheddar 1 kg",     b: "Su rubro",         c: clp(4990), tono: "info" },
      { a: "Ketchup 5 kg",           b: "Oferta del mes",   c: clp(3490), tono: "warn" },
    ],
    pie: "Check-in con GPS · funciona sin señal",
  },
  {
    hora: "11:05",
    tag: "PEDIDO",
    titulo: clp(864200) + " confirmado",
    sub: "Directo a bodega, sin planilla",
    filas: [
      { a: "12 líneas",        b: "Precio acordado", c: "OK",       tono: "ok" },
      { a: "Stock verificado", b: "Sin quiebres",    c: "OK",       tono: "ok" },
      { a: "Gerencia",         b: "Lo ve al instante", c: "En vivo", tono: "info" },
    ],
    pie: "Del pedido a bodega en 40 segundos",
  },
];

const TONO: Record<string, string> = {
  ok: "#39ff14",
  warn: "#f5b40a",
  info: "#3fb9ff",
};

export default function HeroAppMock() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % PASOS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const p = PASOS[i];

  return (
    <div className="relative w-full max-w-[560px]">
      {/* Marco: se lee como la app, no como un gráfico */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070a07] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        {/* Barra superior */}
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#39ff14]/70" />
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
              {p.tag}
            </span>
          </div>
          <span className="font-display text-[11px] font-bold tabular-nums text-white/35">
            {p.hora}
          </span>
        </div>

        {/* Cabecera del estado */}
        <div className="px-5 pb-4 pt-5">
          <p className="font-display text-xl font-bold leading-tight text-white sm:text-2xl">
            {p.titulo}
          </p>
          <p className="mt-1 text-[13px] text-white/45">{p.sub}</p>
        </div>

        {/* Las filas — la sustancia */}
        <div className="space-y-1.5 px-3 pb-3">
          {p.filas.map((f, k) => (
            <div
              key={p.tag + k}
              className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3"
              style={{ animation: `bsRow 420ms ease ${k * 70}ms both` }}
            >
              <span
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: TONO[f.tono] }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[13.5px] font-semibold text-white">
                  {f.a}
                </p>
                <p className="truncate text-[11.5px] text-white/38">{f.b}</p>
              </div>
              <span
                className="flex-none font-display text-[13px] font-bold tabular-nums"
                style={{ color: TONO[f.tono] }}
              >
                {f.c}
              </span>
            </div>
          ))}
        </div>

        {/* Pie */}
        <div className="border-t border-white/8 px-5 py-3">
          <p className="text-[11.5px] text-white/40">{p.pie}</p>
        </div>
      </div>

      {/* Indicador de paso: se ve que es un ciclo, no una animación suelta */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {PASOS.map((s, k) => (
          <button
            key={s.tag}
            type="button"
            onClick={() => setI(k)}
            aria-label={`Ver ${s.tag}`}
            className="h-1 rounded-full transition-all"
            style={{
              width: k === i ? 28 : 12,
              background: k === i ? "#39ff14" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes bsRow {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="animation"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
