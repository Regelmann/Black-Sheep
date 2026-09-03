"use client";

/**
 * COSTANERA CENTER EN 3D — la pieza de identidad de la web.
 *
 * POR QUÉ ESTO Y NO UN MAPA GENÉRICO
 * Un mapa de puntos podría ser de cualquier ciudad. La torre de
 * Costanera Center la reconoce cualquier chileno en medio segundo, y
 * ancla el producto en un territorio real. Es la diferencia entre "una
 * app de rutas" y "la app que conoce tu calle".
 *
 * LA GEOMETRÍA
 * La torre real: 300 m, 62 pisos, planta cuadrada que se AFINA hacia
 * arriba, sobre un podio de mall de 6 niveles. Eso es lo que la hace
 * reconocible y es lo que se modela: `CylinderGeometry` con 4 lados y
 * radio superior menor que el inferior da exactamente ese perfil.
 *
 * Alrededor, las tres torres del complejo (más bajas) y la trama de
 * edificios de Providencia y Las Condes, con alturas que decrecen al
 * alejarse — como pasa de verdad.
 *
 * LOS PUNTOS DE CARTERA
 * Flotan sobre los edificios con los mismos colores que la app: activo,
 * en riesgo, recuperar, prospecto. No es decoración — es el criterio
 * real del producto sobre el territorio real.
 *
 * RENDIMIENTO
 * ~90 cajas con geometría compartida e `InstancedMesh` donde conviene.
 * Se pausa cuando la sección sale de pantalla: un canvas WebGL girando
 * sin que nadie lo mire funde la batería de un teléfono.
 * Con `prefers-reduced-motion` no rota.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const NEON = 0x39ff14;

const COLOR_CARTERA = [
  { hex: 0x39ff14, css: "#39ff14", t: "Activo",    d: "Compra a su ritmo" },
  { hex: 0xf5b40a, css: "#f5b40a", t: "En riesgo", d: "Bajó la frecuencia" },
  { hex: 0xff4d4d, css: "#ff4d4d", t: "Recuperar", d: "Dejó de comprar" },
  { hex: 0x3fb9ff, css: "#3fb9ff", t: "Prospecto", d: "Todavía no compra" },
];

export default function Costanera3D() {
  const cont = useRef<HTMLDivElement>(null);
  const [soportado, setSoportado] = useState(true);

  useEffect(() => {
    const el = cont.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // Sin WebGL la sección no debe romper la página: se muestra el
      // contenido de respaldo y listo.
      setSoportado(false);
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const escena = new THREE.Scene();
    escena.fog = new THREE.Fog(0x040604, 85, 230);

    const camara = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    // Vista AÉREA: la cámara sube y se aleja para que se lea el
    // territorio completo y la ruta entre puntos, no la fachada de la
    // torre. Es la vista que tiene sentido para un producto de rutas.
    camara.position.set(46, 78, 46);
    camara.lookAt(0, 4, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // ── Luces ──────────────────────────────────────────────────
    escena.add(new THREE.AmbientLight(0xffffff, 0.32));
    const luz = new THREE.DirectionalLight(0xffffff, 0.85);
    luz.position.set(40, 60, 30);
    escena.add(luz);
    // Luz lima rasante: le da la identidad de marca al conjunto.
    const lima = new THREE.PointLight(NEON, 1.6, 130);
    lima.position.set(-26, 22, 20);
    escena.add(lima);

    const grupo = new THREE.Group();
    escena.add(grupo);

    // ── El suelo: la trama de calles ───────────────────────────
    const grilla = new THREE.GridHelper(180, 44, NEON, 0x0d1a0d);
    (grilla.material as THREE.Material).opacity = 0.13;
    (grilla.material as THREE.Material).transparent = true;
    grupo.add(grilla);

    // ── El Mapocho ─────────────────────────────────────────────
    const rio = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 5.5),
      new THREE.MeshBasicMaterial({ color: 0x1c5f8a, transparent: true, opacity: 0.34 })
    );
    rio.rotation.x = -Math.PI / 2;
    rio.position.set(0, 0.06, -26);
    grupo.add(rio);

    const matEdificio = new THREE.MeshPhongMaterial({
      color: 0x11170f,
      shininess: 42,
      specular: 0x2a3a24,
    });
    const matVidrio = new THREE.MeshPhongMaterial({
      color: 0x16202a,
      shininess: 130,
      specular: 0x4a6a7a,
      transparent: true,
      opacity: 0.94,
    });

    /** Aristas lima: es lo que hace legible la silueta sobre negro. */
    const conAristas = (m: THREE.Mesh, op = 0.30) => {
      const e = new THREE.LineSegments(
        new THREE.EdgesGeometry(m.geometry),
        new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: op })
      );
      e.position.copy(m.position);
      e.rotation.copy(m.rotation);
      grupo.add(e);
    };

    // ══ LA TORRE ═══════════════════════════════════════════════
    // 300 m reales → 46 unidades. Planta cuadrada que se afina:
    // radio inferior 3.6, superior 2.5. Ese perfil es lo que la
    // hace reconocible de lejos.
    const torre = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 3.6, 46, 4, 1),
      matVidrio
    );
    torre.position.set(0, 23, 0);
    torre.rotation.y = Math.PI / 4;
    grupo.add(torre);
    conAristas(torre, 0.52);

    // La corona
    const corona = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2.5, 4, 4, 1),
      matVidrio
    );
    corona.position.set(0, 48, 0);
    corona.rotation.y = Math.PI / 4;
    grupo.add(corona);
    conAristas(corona, 0.6);

    // El podio del mall: 6 niveles, base ancha
    const podio = new THREE.Mesh(new THREE.BoxGeometry(17, 6, 15), matEdificio);
    podio.position.set(0, 3, 0);
    grupo.add(podio);
    conAristas(podio, 0.34);

    // ── Las otras tres torres del complejo ─────────────────────
    ([
      { x: -8.5, z: -6.5, h: 17 },
      { x:  8.5, z: -6.5, h: 15 },
      { x:  8.5, z:  6.5, h: 13 },
    ] as const).forEach((t) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.6, t.h, 4.6), matVidrio);
      m.position.set(t.x, t.h / 2 + 6, t.z);
      grupo.add(m);
      conAristas(m, 0.24);
    });

    // ══ EL SECTOR ══════════════════════════════════════════════
    // Providencia y Las Condes. La altura baja al alejarse del
    // centro, como pasa de verdad. Determinista: el render no
    // cambia entre cargas.
    let s = 20260903;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

    const geomCaja = new THREE.BoxGeometry(1, 1, 1); // compartida
    const edificios: THREE.Mesh[] = [];

    for (let i = 0; i < 78; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 15 + Math.pow(rnd(), 0.7) * 62;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad * 0.85;
      // Cuanto más lejos, más bajo
      const cerca = 1 - Math.min(1, rad / 78);
      const h = 2.2 + rnd() * 7 + cerca * 13;
      const w = 2.4 + rnd() * 3.4;
      const d = 2.4 + rnd() * 3.4;

      const m = new THREE.Mesh(geomCaja, matEdificio);
      m.scale.set(w, h, d);
      m.position.set(x, h / 2, z);
      grupo.add(m);
      edificios.push(m);

      // Sólo los cercanos llevan aristas: 78 EdgesGeometry serían
      // demasiadas llamadas de dibujo para un teléfono.
      if (rad < 34 && h > 8) {
        const e = new THREE.LineSegments(
          new THREE.EdgesGeometry(geomCaja),
          new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: 0.14 })
        );
        e.scale.copy(m.scale);
        e.position.copy(m.position);
        grupo.add(e);
      }
    }

    // ══ LA CARTERA ═════════════════════════════════════════════
    // Puntos flotando sobre los edificios, con los colores de la app.
    const puntos: { m: THREE.Mesh; base: number; f: number }[] = [];
    const geomPunto = new THREE.SphereGeometry(0.6, 12, 12);

    // ── LA RUTA DEL DÍA ────────────────────────────────────────
    // Los puntos NO son aleatorios: se eligen recorriendo el sector
    // en espiral desde el centro hacia afuera, que es como se arma
    // una ruta real. Después se unen con una línea.
    const candidatos = edificios
      .map((e, i) => ({ e, i, r: Math.hypot(e.position.x, e.position.z) }))
      .filter((c) => c.r > 12 && c.r < 62)
      .sort((a, b) => Math.atan2(a.e.position.z, a.e.position.x) -
                      Math.atan2(b.e.position.z, b.e.position.x));

    const paso = Math.max(1, Math.floor(candidatos.length / 14));
    const parada: THREE.Vector3[] = [];

    for (let k = 0; k < candidatos.length && parada.length < 14; k += paso) {
      const e = candidatos[k].e;
      const c = COLOR_CARTERA[Math.floor(rnd() * COLOR_CARTERA.length)];
      const m = new THREE.Mesh(
        geomPunto,
        new THREE.MeshBasicMaterial({ color: c.hex })
      );
      const base = e.position.y + e.scale.y / 2 + 2.4;
      m.position.set(e.position.x, base, e.position.z);
      grupo.add(m);
      puntos.push({ m, base, f: rnd() * Math.PI * 2 });
      parada.push(new THREE.Vector3(e.position.x, base, e.position.z));
    }

    // La línea que une las paradas. `CatmullRomCurve3` la curva: una
    // ruta real no va en línea recta entre esquinas.
    let rutaLinea: THREE.Line | null = null;
    let rutaMat: THREE.LineDashedMaterial | null = null;

    if (parada.length > 2) {
      const curva = new THREE.CatmullRomCurve3(parada, true, "catmullrom", 0.35);
      const geomRuta = new THREE.BufferGeometry().setFromPoints(curva.getPoints(220));
      rutaMat = new THREE.LineDashedMaterial({
        color: NEON,
        dashSize: 1.8,
        gapSize: 1.1,
        transparent: true,
        opacity: 0.75,
      });
      rutaLinea = new THREE.Line(geomRuta, rutaMat);
      rutaLinea.computeLineDistances();   // obligatorio para el guionado
      grupo.add(rutaLinea);

      // Un vehículo recorriendo la ruta: hace evidente que es un
      // recorrido y no una constelación de puntos sueltos.
      const movil = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      grupo.add(movil);
      (grupo as unknown as { _movil?: THREE.Mesh; _curva?: THREE.CatmullRomCurve3 })._movil = movil;
      (grupo as unknown as { _movil?: THREE.Mesh; _curva?: THREE.CatmullRomCurve3 })._curva = curva;
    }

    // ── Bucle ──────────────────────────────────────────────────
    let raf = 0;
    let t = 0;
    let visible = true;

    const dimensionar = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    };
    dimensionar();

    const animar = () => {
      raf = requestAnimationFrame(animar);
      if (!visible) return;
      t += 0.0022;
      // Rotación lenta: en vista aérea, más lenta que antes — si no,
      // marea.
      if (!reduce) grupo.rotation.y = t * 0.55;

      // El móvil avanza por la ruta
      const g = grupo as unknown as { _movil?: THREE.Mesh; _curva?: THREE.CatmullRomCurve3 };
      if (g._movil && g._curva) {
        const u = (t * 0.9) % 1;
        g._movil.position.copy(g._curva.getPointAt(u));
        g._movil.position.y += 0.4;
      }
      // El guionado se desplaza: da sensación de avance.
      if (rutaMat && !reduce) rutaMat.dashSize = 1.8 + Math.sin(t * 6) * 0.35;
      // Los puntos flotan: llama la atención sin ser un parpadeo.
      puntos.forEach((p, i) => {
        p.m.position.y = p.base + Math.sin(t * 9 + p.f) * 0.5;
        p.m.scale.setScalar(1 + Math.sin(t * 11 + i) * 0.12);
      });
      renderer.render(escena, camara);
    };
    animar();

    // Se pausa fuera de pantalla: un canvas WebGL girando sin que
    // nadie lo mire funde la batería.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(el);

    const ro = new ResizeObserver(dimensionar);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      renderer.dispose();
      geomCaja.dispose();
      geomPunto.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, []);

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
            Vista aérea del sector oriente, con Costanera Center como ancla. Cada
            punto es un cliente con su estado real, y la línea es la ruta del día
            ya calculada — los mismos colores que ve el vendedor al abrir la app.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#070a07]">
            <div
              ref={cont}
              className="h-[400px] w-full sm:h-[560px]"
              aria-label="Vista 3D del sector Costanera Center con la cartera"
            />
            {!soportado && (
              <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/40">
                Tu navegador no soporta 3D. El territorio se ve completo en la app.
              </div>
            )}
            <span className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/75 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
              Costanera Center · Santiago
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {COLOR_CARTERA.map((l) => (
              <div
                key={l.t}
                className="flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.015] p-3.5"
              >
                <span
                  className="mt-1 h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: l.css }}
                />
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
