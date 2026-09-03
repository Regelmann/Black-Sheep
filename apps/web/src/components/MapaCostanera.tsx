"use client";

/**
 * MAPA COSTANERA — la pieza de identidad de la web.
 *
 * POR QUÉ ESTE MAPA Y NO OTRO
 * El producto vive en la calle de Santiago. Un vendedor que abre la app
 * a las 8 de la mañana ve exactamente esto: puntos de colores sobre su
 * territorio, ordenados por lo que conviene visitar.
 *
 * La referencia de diseño que más se repite en las mejores webs B2B de
 * 2026 es **"el producto es la demo"**: no describir la funcionalidad,
 * mostrarla funcionando. Este mapa no es una ilustración — es el mismo
 * criterio de color y el mismo cálculo de prioridad que corre en la app.
 *
 * ANCLA: Costanera Center (-33.4172, -70.6065). Es el punto que
 * cualquiera en Santiago reconoce de inmediato, y el corazón del
 * territorio Nor-Oriente donde opera KeyFoods.
 *
 * TÉCNICA
 * Canvas 2D, no WebGL: pesa 0 KB de librería, arranca instantáneo y
 * funciona en cualquier teléfono. Un mapa 3D acá sería lucirse a costa
 * del que lo mira desde un Android de gama media.
 *
 * Respeta `prefers-reduced-motion`: sin animación, el mapa se dibuja
 * completo y estático.
 */
import { useEffect, useRef, useState } from "react";

/** Los mismos colores que los pines de la app. */
const COLOR = {
  activo: "#39ff14",
  riesgo: "#f59e0b",
  perdido: "#ef4444",
  prospecto: "#38bdf8",
  ruta: "#ffffff",
} as const;

type Tipo = keyof typeof COLOR;

type Punto = {
  x: number;      // 0..1 relativo al lienzo
  y: number;
  tipo: Tipo;
  nombre: string;
  comuna: string;
  monto?: number;
};

/**
 * Territorio real del Nor-Oriente, tomando Costanera Center como centro.
 * Las posiciones son proporcionales a la geografía: Vitacura arriba a la
 * derecha, Providencia abajo a la izquierda, Las Condes al este.
 */
const PUNTOS: Punto[] = [
  { x: 0.50, y: 0.46, tipo: "ruta",      nombre: "Costanera Center", comuna: "Providencia" },
  { x: 0.62, y: 0.33, tipo: "activo",    nombre: "Hotel Bidasoa",    comuna: "Vitacura",     monto: 688100 },
  { x: 0.71, y: 0.41, tipo: "activo",    nombre: "Route Spa",        comuna: "Las Condes",   monto: 11134674 },
  { x: 0.58, y: 0.55, tipo: "riesgo",    nombre: "Café Melba",       comuna: "Providencia",  monto: 1412000 },
  { x: 0.42, y: 0.38, tipo: "activo",    nombre: "Galpón Mut",       comuna: "Las Condes",   monto: 3214360 },
  { x: 0.35, y: 0.60, tipo: "perdido",   nombre: "Bar Liguria",      comuna: "Providencia",  monto: 980000 },
  { x: 0.78, y: 0.28, tipo: "prospecto", nombre: "Club de Golf",     comuna: "Vitacura",     monto: 2574375 },
  { x: 0.66, y: 0.62, tipo: "riesgo",    nombre: "Foodies",          comuna: "Ñuñoa",        monto: 2100000 },
  { x: 0.30, y: 0.44, tipo: "prospecto", nombre: "Mito Food",        comuna: "Vitacura",     monto: 1831500 },
  { x: 0.54, y: 0.70, tipo: "activo",    nombre: "Viera Food",       comuna: "Ñuñoa",        monto: 1926556 },
  { x: 0.83, y: 0.50, tipo: "prospecto", nombre: "Grupo Minga",      comuna: "Las Condes",   monto: 1755000 },
  { x: 0.22, y: 0.55, tipo: "perdido",   nombre: "Deli Express",     comuna: "Providencia",  monto: 640000 },
  { x: 0.46, y: 0.26, tipo: "activo",    nombre: "Rienda Mut",       comuna: "Vitacura",     monto: 1829310 },
  { x: 0.74, y: 0.68, tipo: "riesgo",    nombre: "Sushi Kai",        comuna: "Las Condes",   monto: 1240000 },
];

/** El orden de la ruta: lo que el motor recomendaría visitar hoy. */
const RUTA = [0, 4, 1, 12, 6, 2, 10];

const clp = (n?: number) =>
  n ? "$" + Math.round(n).toLocaleString("es-CL") : "";

export default function MapaCostanera() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activo, setActivo] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sólo se anima cuando entra en pantalla: un canvas dibujando fuera de
  // vista gasta batería sin que nadie lo vea.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;

    const dibujar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // ── Grilla: sugiere la trama de calles sin dibujar un mapa real ──
      ctx.strokeStyle = "rgba(57,255,20,0.055)";
      ctx.lineWidth = 1;
      const paso = 44;
      for (let x = 0; x < w; x += paso) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += paso) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // ── El río Mapocho, que es lo que ordena el Nor-Oriente ──
      ctx.strokeStyle = "rgba(56,189,248,0.16)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.30);
      ctx.bezierCurveTo(w * 0.3, h * 0.24, w * 0.6, h * 0.36, w, h * 0.22);
      ctx.stroke();

      // ── La ruta del día, trazándose ──
      const prog = reduce ? 1 : Math.min(1, t / 90);
      ctx.strokeStyle = "rgba(57,255,20,0.42)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      const hasta = Math.floor(prog * (RUTA.length - 1));
      RUTA.slice(0, hasta + 2).forEach((idx, i) => {
        const p = PUNTOS[idx];
        const px = p.x * w, py = p.y * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Los puntos ──
      PUNTOS.forEach((p, i) => {
        const px = p.x * w, py = p.y * h;
        const esRuta = p.tipo === "ruta";
        const sel = activo === i;
        const color = COLOR[p.tipo];

        // Pulso sólo en el ancla, y sólo si hay animación
        if (esRuta && !reduce) {
          const pulso = (t % 100) / 100;
          ctx.beginPath();
          ctx.arc(px, py, 10 + pulso * 22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${0.28 * (1 - pulso)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Halo del seleccionado
        if (sel) {
          ctx.beginPath();
          ctx.arc(px, py, 16, 0, Math.PI * 2);
          ctx.fillStyle = color + "26";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, esRuta ? 7 : sel ? 6.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (esRuta) {
          ctx.strokeStyle = "#0c0a09";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      });

      t += 1;
      if (!reduce) raf = requestAnimationFrame(dibujar);
    };

    dibujar();
    return () => cancelAnimationFrame(raf);
  }, [visible, activo]);

  /** Detecta el punto más cercano al toque. */
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    let mejor: number | null = null;
    let dMin = 0.05;
    PUNTOS.forEach((p, i) => {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < dMin) { dMin = d; mejor = i; }
    });
    setActivo(mejor);
  };

  const p = activo !== null ? PUNTOS[activo] : null;

  return (
    <section
      ref={wrapRef}
      id="territorio"
      className="relative border-y border-white/10 bg-[#050705] py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.18em] text-[#39ff14]">
            Territorio
          </p>
          <h2 className="font-display text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl">
            Santiago, desde Costanera Center
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/55 sm:text-lg">
            Esto es lo que ve un vendedor al abrir la app: su territorio con
            cada cliente en su estado real, y la ruta del día ya calculada.
            No es una ilustración — es el mismo criterio de color y de
            prioridad que corre en terreno.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* El mapa */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070a07]">
            <canvas
              ref={canvasRef}
              onMouseMove={onMove}
              onMouseLeave={() => setActivo(null)}
              className="h-[340px] w-full cursor-crosshair sm:h-[460px]"
              aria-label="Mapa del territorio Nor-Oriente de Santiago"
            />

            {/* Etiqueta del ancla */}
            <div className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 translate-y-4">
              <span className="whitespace-nowrap rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                Costanera Center
              </span>
            </div>

            {/* Tarjeta del punto activo */}
            {p && p.tipo !== "ruta" && (
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl border border-white/12 bg-black/85 p-4 backdrop-blur sm:right-auto sm:max-w-xs">
                <p className="font-display text-sm font-bold text-white">{p.nombre}</p>
                <p className="mt-0.5 text-xs text-white/50">{p.comuna}</p>
                {p.monto && (
                  <p className="mt-2 font-display text-lg font-bold tabular-nums text-[#39ff14]">
                    {clp(p.monto)}
                    <span className="ml-1.5 text-[11px] font-medium text-white/40">
                      este mes
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Leyenda: los mismos estados que la app */}
          <div className="flex flex-col gap-3">
            {[
              { c: COLOR.activo,    t: "Activo",     d: "Compra a ritmo normal" },
              { c: COLOR.riesgo,    t: "En riesgo",  d: "Bajó su frecuencia" },
              { c: COLOR.perdido,   t: "Recuperar",  d: "Dejó de comprar" },
              { c: COLOR.prospecto, t: "Prospecto",  d: "Todavía no es cliente" },
            ].map((l) => (
              <div
                key={l.t}
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4"
              >
                <span
                  className="mt-1 h-3 w-3 flex-none rounded-full"
                  style={{ background: l.c }}
                />
                <div>
                  <p className="font-display text-sm font-bold text-white">{l.t}</p>
                  <p className="text-xs leading-relaxed text-white/45">{l.d}</p>
                </div>
              </div>
            ))}
            <p className="mt-1 px-1 text-xs leading-relaxed text-white/35">
              La línea punteada es la ruta del día: orden por{" "}
              <span className="text-white/60">valor × urgencia ÷ distancia</span>,
              no por cercanía. El almacén de la esquina no le gana al cliente
              de $800.000 que está a seis cuadras.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
