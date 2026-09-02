"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { puntosDemo, type PuntoMapa } from "@/lib/mapaPuntos";

type MapaChileRMProps = {
  puntos?: PuntoMapa[];
};

/** Hora actual en Región Metropolitana (America/Santiago), 0-23. */
function horaSantiago(): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago",
      hour: "2-digit",
      hour12: false,
    });
    return parseInt(fmt.format(new Date()), 10);
  } catch {
    return new Date().getHours();
  }
}

/**
 * MapaChileRM
 * Terreno 3D procedural (estilizado, no topografía real) con puntos de
 * visitas/prospectos pulsando. Rotación lenta + parallax al mouse. Se pausa
 * fuera de viewport. Respeta prefers-reduced-motion.
 *
 * Detalle nuevo: la luz ambiente cambia sutilmente según la hora real de
 * Santiago (día = ambiente algo más cálido/brillante, noche = tono frío,
 * como ahora). El fondo se mantiene siempre oscuro — es el look de la marca,
 * no un modo claro.
 *
 * IMPORTANTE: usa WebGL → importar con next/dynamic ssr:false (ver
 * MapaChileRMSection.tsx).
 */
export default function MapaChileRM({ puntos = puntosDemo }: MapaChileRMProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hora = horaSantiago();
    const esDia = hora >= 7 && hora < 19;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    scene.add(group);

    const SIZE = 16;
    const SEG = 90;

    const noise = (x: number, z: number) =>
      Math.sin(x * 0.35) * 0.6 + Math.cos(z * 0.28) * 0.5 + Math.sin((x + z) * 0.15) * 0.8;

    // --- terreno ---
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const cLow = new THREE.Color(0x030603);
    const cHigh = esDia ? new THREE.Color(0x1a4a1a) : new THREE.Color(0x113311);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = noise(x, z);
      pos.setY(i, y);
      const t = Math.max(0, Math.min(1, (y + 1.9) / 3.8));
      const c = cLow.clone().lerp(cHigh, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.05,
        flatShading: true,
      })
    );
    group.add(terrain);

    // --- grilla neón encima ---
    const wireGeo = new THREE.PlaneGeometry(SIZE, SIZE, 18, 18);
    wireGeo.rotateX(-Math.PI / 2);
    const wpos = wireGeo.attributes.position;
    for (let i = 0; i < wpos.count; i++) {
      const x = wpos.getX(i);
      const z = wpos.getZ(i);
      wpos.setY(i, noise(x, z) + 0.02);
    }
    group.add(
      new THREE.Mesh(
        wireGeo,
        new THREE.MeshBasicMaterial({
          color: 0x39ff14,
          wireframe: true,
          transparent: true,
          opacity: esDia ? 0.09 : 0.12,
        })
      )
    );

    // --- luces (varían sutilmente según hora real de Santiago) ---
    scene.add(new THREE.AmbientLight(0x335533, esDia ? 1.15 : 0.9));
    const key = new THREE.PointLight(0x39ff14, esDia ? 1.1 : 1.4, 30);
    key.position.set(4, 6, 4);
    scene.add(key);
    const rim = new THREE.PointLight(esDia ? 0xffaa55 : 0x2244ff, esDia ? 0.5 : 0.4, 30);
    rim.position.set(-6, 4, -4);
    scene.add(rim);

    // --- puntos (visitas / prospectos / riesgo) ---
    const markerGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const markers: { mesh: THREE.Mesh; halo: THREE.Sprite; phase: number }[] = [];

    puntos.forEach((p) => {
      const risky = p.estado === "riesgo";
      const color = risky ? 0xff5c5c : 0x39ff14;
      const x = p.x * SIZE * 0.85;
      const z = p.z * SIZE * 0.85;
      const y = noise(x, z) + 0.18;

      const mesh = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(x, y, z);
      group.add(mesh);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
      );
      halo.scale.set(0.5, 0.5, 0.5);
      halo.position.copy(mesh.position);
      group.add(halo);

      markers.push({ mesh, halo, phase: Math.random() * Math.PI * 2 });
    });

    group.rotation.x = -0.15;

    let mouseX = 0;
    let mouseY = 0;
    function handleMove(e: MouseEvent) {
      const r = stage!.getBoundingClientRect();
      mouseX = (e.clientX - r.left) / r.width - 0.5;
      mouseY = (e.clientY - r.top) / r.height - 0.5;
    }
    stage.addEventListener("mousemove", handleMove);

    function size() {
      const w = stage!.clientWidth;
      const h = stage!.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    size();
    window.addEventListener("resize", size);

    let raf = 0;
    const clock = new THREE.Clock();
    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!reduced) {
        group.rotation.y += 0.0015;
        camera.position.x += (mouseX * 2 - camera.position.x) * 0.03;
        camera.position.y += (8 - mouseY * 1.5 - camera.position.y) * 0.03;
        camera.lookAt(0, 0, 0);
        markers.forEach(({ mesh, halo, phase }) => {
          const s = 1 + Math.sin(t * 2 + phase) * 0.25;
          mesh.scale.setScalar(s);
          halo.scale.setScalar(0.5 + Math.sin(t * 2 + phase) * 0.15);
        });
      }
      renderer.render(scene, camera);
    }
    animate();

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) {
            cancelAnimationFrame(raf);
            raf = 0;
          } else if (!raf) {
            animate();
          }
        });
      },
      { threshold: 0.05 }
    );
    io.observe(stage);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      stage.removeEventListener("mousemove", handleMove);
      renderer.dispose();
      geo.dispose();
      wireGeo.dispose();
      markerGeo.dispose();
      if (renderer.domElement.parentNode === stage) {
        stage.removeChild(renderer.domElement);
      }
    };
  }, [puntos]);

  return (
    <section className="bs-map-wrap" id="mapa-rm">
      <div className="bs-map-head">
        <span className="bs-eyebrow">Red operativa</span>
        <h2>Chile / Región Metropolitana</h2>
        <p>
          Terreno estilizado con los puntos de visitas y prospectos en vivo. Girá
          lentamente; movés el mouse para inclinar la cámara.
        </p>
      </div>

      <div className="bs-map-stage" ref={stageRef}>
        <div className="bs-map-hud">
          <span className="bs-hud-chip">
            <span className="bs-hud-dot" /> RM · en vivo
          </span>
          <span className="bs-hud-chip">{puntos.length} puntos activos</span>
        </div>
        <div className="bs-map-legend">
          <span>
            <span className="bs-legend-dot bs-legend-visita" /> Visita / prospecto
          </span>
          <span>
            <span className="bs-legend-dot bs-legend-riesgo" /> Riesgo de fuga
          </span>
        </div>
        <div className="bs-map-hint">Mové el mouse sobre el mapa</div>
      </div>

      <style jsx>{`
        .bs-map-wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          align-items: center;
          padding: 6rem 6vw;
          background: radial-gradient(50% 40% at 50% 0%, rgba(57, 255, 20, 0.06), transparent 60%),
            #050705;
        }
        .bs-map-head {
          max-width: 34ch;
          text-align: center;
        }
        .bs-eyebrow {
          color: #39ff14;
          font-size: 0.8rem;
          letter-spacing: 0.02em;
        }
        .bs-map-head h2 {
          font-size: clamp(1.5rem, 3vw, 2.1rem);
          margin: 0.5rem 0;
          font-weight: 650;
          color: #eafbea;
        }
        .bs-map-head p {
          color: #8fa38f;
          font-size: 0.95rem;
          line-height: 1.5;
          margin: 0;
        }
        .bs-map-stage {
          position: relative;
          width: min(920px, 92vw);
          height: 560px;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(57, 255, 20, 0.18);
          background: rgba(4, 6, 4, 0.5);
        }
        .bs-map-stage :global(canvas) {
          display: block;
          width: 100%;
          height: 100%;
        }
        .bs-map-hud {
          position: absolute;
          top: 1rem;
          left: 1rem;
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .bs-hud-chip {
          font-size: 0.72rem;
          color: #8fa38f;
          background: rgba(5, 7, 5, 0.75);
          border: 1px solid rgba(57, 255, 20, 0.18);
          border-radius: 999px;
          padding: 0.32rem 0.7rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .bs-hud-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #39ff14;
          box-shadow: 0 0 8px #39ff14;
        }
        .bs-map-legend {
          position: absolute;
          bottom: 1rem;
          left: 1rem;
          font-size: 0.72rem;
          color: #8fa38f;
          display: flex;
          gap: 1rem;
        }
        .bs-map-legend span {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .bs-legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .bs-legend-visita {
          background: #39ff14;
          box-shadow: 0 0 8px #39ff14;
        }
        .bs-legend-riesgo {
          background: #ff5c5c;
          box-shadow: 0 0 8px #ff5c5c;
        }
        .bs-map-hint {
          position: absolute;
          bottom: 1rem;
          right: 1rem;
          font-size: 0.7rem;
          color: #8fa38f;
        }
        @media (max-width: 640px) {
          .bs-map-stage {
            height: 420px;
          }
          .bs-map-hint {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
