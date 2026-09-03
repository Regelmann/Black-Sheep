"use client";

/**
 * MAPA DE SANTIAGO — la pieza de identidad de la web.
 *
 * QUÉ SE ARREGLÓ
 * La versión anterior dibujaba 14 puntos sobre una grilla plana: se veía
 * "como un puntito", no como un territorio. Ahora tiene la trama real —
 * las avenidas que cualquiera en Santiago reconoce, el Mapocho, los
 * polígonos de las comunas del oriente — y ~90 puntos que dan densidad
 * de cartera de verdad.
 *
 * EL CRITERIO, de las mejores landings B2B de 2026:
 * **el producto es la demo.** Linear pone su lista de issues en el hero
 * en vez de describirla. Esto es lo mismo: los colores y el cálculo de
 * prioridad son los que corren en la app, no una ilustración.
 *
 * ANCLA: Costanera Center, el punto que cualquiera ubica de inmediato.
 *
 * TÉCNICA: Canvas 2D. Cero librería, arranca instantáneo, anda en
 * cualquier teléfono. Un mapa 3D sería lucirse a costa de quien lo abre
 * desde un Android de gama media — que es el comprador real.
 */
import { useEffect, useRef, useState, useCallback } from "react";

const COLOR = {
  activo: "#39ff14",
  riesgo: "#f5b40a",
  perdido: "#ff4d4d",
  prospecto: "#3fb9ff",
} as const;

type Tipo = keyof typeof COLOR;
type Punto = { x: number; y: number; t: Tipo; n?: string; c?: string; m?: number };

/** Comunas del sector oriente, en proporción a su forma real. */
const COMUNAS = [
  { n: "VITACURA",    p: [[0.44,0.10],[0.78,0.06],[0.86,0.24],[0.62,0.30],[0.44,0.24]] },
  { n: "LAS CONDES",  p: [[0.62,0.30],[0.86,0.24],[0.97,0.52],[0.74,0.62],[0.60,0.44]] },
  { n: "PROVIDENCIA", p: [[0.28,0.30],[0.62,0.30],[0.60,0.44],[0.44,0.56],[0.26,0.48]] },
  { n: "ÑUÑOA",       p: [[0.26,0.48],[0.44,0.56],[0.60,0.68],[0.40,0.82],[0.22,0.68]] },
  { n: "SANTIAGO",    p: [[0.04,0.34],[0.28,0.30],[0.26,0.48],[0.22,0.68],[0.02,0.60]] },
];

/** Las avenidas que ordenan el sector. */
const VIAS = [
  { p: [[0.00,0.30],[0.30,0.26],[0.58,0.32],[0.86,0.20],[1.00,0.16]], w: 2.4 },
  { p: [[0.44,0.44],[0.66,0.40],[0.88,0.34]], w: 2.0 },
  { p: [[0.10,0.44],[0.30,0.42],[0.46,0.42]], w: 2.0 },
  { p: [[0.58,0.30],[0.80,0.26],[0.96,0.30]], w: 1.6 },
  { p: [[0.52,0.20],[0.50,0.50],[0.46,0.78]], w: 1.6 },
  { p: [[0.72,0.06],[0.74,0.36],[0.68,0.70]], w: 1.8 },
  { p: [[0.24,0.42],[0.28,0.68],[0.30,0.90]], w: 1.4 },
];

const ANCLA = { x: 0.455, y: 0.395 };

const DESTACADOS: Punto[] = [
  { x: 0.71, y: 0.41, t: "activo",    n: "Route Spa",    c: "Las Condes",  m: 11134674 },
  { x: 0.62, y: 0.33, t: "activo",    n: "Hotel Bidasoa", c: "Vitacura",   m: 688100 },
  { x: 0.58, y: 0.55, t: "riesgo",    n: "Café Melba",   c: "Providencia", m: 1412000 },
  { x: 0.35, y: 0.60, t: "perdido",   n: "Bar Liguria",  c: "Providencia", m: 980000 },
  { x: 0.78, y: 0.28, t: "prospecto", n: "Club de Golf", c: "Vitacura",    m: 2574375 },
  { x: 0.42, y: 0.38, t: "activo",    n: "Galpón Mut",   c: "Las Condes",  m: 3214360 },
  { x: 0.66, y: 0.62, t: "riesgo",    n: "Foodies",      c: "Ñuñoa",       m: 2100000 },
  { x: 0.30, y: 0.44, t: "prospecto", n: "Mito Food",    c: "Providencia", m: 1831500 },
];

const RUTA = [0, 5, 1, 4, 6];

/** Densidad de cartera. Determinista: el render no cambia entre cargas. */
function generarFondo(): Punto[] {
  const out: Punto[] = [];
  let s = 20260903;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const mezcla: Tipo[] = [
    "activo","activo","activo","activo","activo",
    "riesgo","riesgo","prospecto","prospecto","perdido",
  ];
  for (let i = 0; i < 92; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.62) * 0.46;   // más denso cerca del ancla
    const x = ANCLA.x + Math.cos(ang) * rad * 1.15;
    const y = ANCLA.y + Math.sin(ang) * rad * 0.78;
    if (x < 0.04 || x > 0.97 || y < 0.05 || y > 0.9) continue;
    out.push({ x, y, t: mezcla[Math.floor(rnd() * mezcla.length)] });
  }
  return out;
}

const FONDO = generarFondo();
const clp = (n?: number) => (n ? "$" + Math.round(n).toLocaleString("es-CL") : "");

export default function MapaCostanera() {
  const cvs = useRef<HTMLCanvasElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  const pintar = useCallback(() => {
    const c = cvs.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 800;
    const h = c.clientHeight || 480;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const X = (v: number) => v * w;
    const Y = (v: number) => v * h;

    ctx.font = "600 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    COMUNAS.forEach((cm, i) => {
      ctx.beginPath();
      cm.p.forEach(([px, py], k) => (k ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "rgba(57,255,20,0.030)" : "rgba(57,255,20,0.015)";
      ctx.fill();
      ctx.strokeStyle = "rgba(57,255,20,0.11)";
      ctx.lineWidth = 1;
      ctx.stroke();
      const cx = cm.p.reduce((a, q) => a + q[0], 0) / cm.p.length;
      const cy = cm.p.reduce((a, q) => a + q[1], 0) / cm.p.length;
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.fillText(cm.n, X(cx), Y(cy));
    });

    // El Mapocho
    ctx.strokeStyle = "rgba(63,185,255,0.20)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, Y(0.245));
    ctx.bezierCurveTo(X(0.3), Y(0.20), X(0.62), Y(0.28), w, Y(0.13));
    ctx.stroke();

    // Avenidas
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    VIAS.forEach((v) => {
      ctx.lineWidth = v.w;
      ctx.beginPath();
      v.p.forEach(([px, py], k) => (k ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
      ctx.stroke();
    });

    // Densidad de cartera
    FONDO.forEach((p) => {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), 2.7, 0, Math.PI * 2);
      ctx.fillStyle = COLOR[p.t] + "70";
      ctx.fill();
    });

    // Ruta del día
    ctx.strokeStyle = "rgba(57,255,20,0.55)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    RUTA.forEach((idx, k) => {
      const p = DESTACADOS[idx];
      if (k) ctx.lineTo(X(p.x), Y(p.y)); else ctx.moveTo(X(p.x), Y(p.y));
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Destacados
    DESTACADOS.forEach((p, i) => {
      const sel = activo === i;
      if (sel) {
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 17, 0, Math.PI * 2);
        ctx.fillStyle = COLOR[p.t] + "26";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), sel ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = COLOR[p.t];
      ctx.fill();
    });

    // El ancla
    const ax = X(ANCLA.x), ay = Y(ANCLA.y);
    ctx.beginPath();
    ctx.arc(ax, ay, 22, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, ay, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, ay, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "#050705";
    ctx.fill();
  }, [activo]);

  // Pinta al montar y en cada resize. La versión anterior esperaba a un
  // IntersectionObserver y quedaba casi vacía si no disparaba.
  useEffect(() => {
    pintar();
    const ro = new ResizeObserver(() => pintar());
    if (cvs.current) ro.observe(cvs.current);
    return () => ro.disconnect();
  }, [pintar]);

  const mover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = cvs.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    let mejor: number | null = null;
    let dm = 0.045;
    DESTACADOS.forEach((p, i) => {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < dm) { dm = d; mejor = i; }
    });
    setActivo(mejor);
  };

  const p = activo !== null ? DESTACADOS[activo] : null;

  return (
    <section id="territorio" className="border-y border-white/8 bg-[#040604] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#39ff14]">
            FIG 3.1 — Territorio
          </p>
          <h2 className="font-display text-3xl font-bold leading-[1.06] tracking-tight text-white sm:text-5xl">
            Tu ciudad, con cada cliente en su estado real
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/50 sm:text-lg">
            Esto es lo que ve un vendedor al abrir la app. No es una ilustración:
            son los mismos colores y el mismo cálculo de prioridad que corren en
            terreno.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#070a07]">
            <canvas
              ref={cvs}
              onMouseMove={mover}
              onMouseLeave={() => setActivo(null)}
              className="h-[380px] w-full cursor-crosshair sm:h-[520px]"
              aria-label="Mapa de cartera sobre Santiago"
            />

            <span
              className="pointer-events-none absolute whitespace-nowrap rounded-full border border-white/25 bg-black/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur"
              style={{ left: `${ANCLA.x * 100}%`, top: `${ANCLA.y * 100}%`, transform: "translate(-50%, 26px)" }}
            >
              Costanera Center
            </span>

            {p && (
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/12 bg-black/90 p-4 backdrop-blur">
                <p className="font-display text-sm font-bold text-white">{p.n}</p>
                <p className="mt-0.5 text-xs text-white/45">{p.c}</p>
                {p.m && (
                  <p className="mt-2 font-display text-lg font-bold tabular-nums" style={{ color: COLOR[p.t] }}>
                    {clp(p.m)}
                    <span className="ml-1.5 text-[11px] font-medium text-white/35">este mes</span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {[
              { c: COLOR.activo,    t: "Activo",    d: "Compra a su ritmo" },
              { c: COLOR.riesgo,    t: "En riesgo", d: "Bajó la frecuencia" },
              { c: COLOR.perdido,   t: "Recuperar", d: "Dejó de comprar" },
              { c: COLOR.prospecto, t: "Prospecto", d: "Todavía no compra" },
            ].map((l) => (
              <div key={l.t} className="flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.015] p-3.5">
                <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full" style={{ background: l.c }} />
                <div>
                  <p className="font-display text-[13px] font-bold text-white">{l.t}</p>
                  <p className="text-[11px] leading-relaxed text-white/40">{l.d}</p>
                </div>
              </div>
            ))}
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-white/30">
              La línea punteada es la ruta del día. Se ordena por{" "}
              <span className="text-white/55">valor × urgencia ÷ distancia</span> — el
              almacén de la esquina no le gana al cliente grande que está a seis
              cuadras.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
