"use client";

import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";

const HUB = "hub";
const EDGE_COLOR = "#2b3674";
const DIM_COLOR = "#1b2559";

const COLORS = {
  hub: "#4318ff",
  stable: "#05cd99",
  alert: "#ee5d50",
  prospect: "#6ea8fe",
} as const;

type Kind = keyof typeof COLORS;
type Tuple = [label: string, deg: number, radius: number, size: number];

function polar(radius: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

/** Clientes estables con rutas recurrentes */
const STABLES: Tuple[] = [
  ["Minimarket Los Trapenses", 158, 2.0, 8],
  ["Almacén El Trébol · Maipú", 205, 2.55, 6],
  ["Botillería San Miguel 26", 132, 2.8, 6],
  ["Distribuidora Andes · Pudahuel", 244, 2.15, 7],
  ["Panadería Central · Ñuñoa", 282, 2.7, 5.5],
  ["Café Bodega · Barrio Italia", 308, 2.2, 6],
  ["Proveeduría 27 · Quilicura", 176, 3.1, 5],
  ["MiniMarket Lo Vial · San Bernardo", 98, 2.35, 5],
];

/** Señales de riesgo de fuga */
const ALERTS: Tuple[] = [
  ["−24% volumen · Providencia", 26, 1.85, 7.5],
  ["Inactivo 21 días · Macul", 54, 2.45, 6],
  ["Quiebre de ritmo · Recoleta", 356, 2.2, 6],
  ["Ticket bajo histórico · Huechuraba", 12, 2.95, 5],
];

/** Prospectos detectados por zona */
const PROSPECTS: Tuple[] = [
  ["Prospecto · Cerro Navia", 224, 3.55, 5],
  ["Lead: Café Flow · Lastarria", 260, 3.95, 4.5],
  ["Prospecto · Estación Central", 116, 3.85, 4.5],
  ["Prospecto · Peñalolén Alto", 300, 3.35, 5],
  ["Lead: Distrib. Luna · Puente Alto", 332, 3.8, 4.5],
  ["Prospecto · Las Condes", 76, 3.25, 5],
];

type NodeDef = {
  id: string;
  label: string;
  kind: Kind;
  x: number;
  y: number;
  size: number;
};

function buildNodes(): NodeDef[] {
  const nodes: NodeDef[] = [
    { id: HUB, label: "Black Sheep Core", kind: "hub", x: 0, y: 0, size: 13 },
  ];
  STABLES.forEach(([label, deg, r, size], i) => {
    const { x, y } = polar(r, deg);
    nodes.push({ id: `s${i}`, label, kind: "stable", x, y, size });
  });
  ALERTS.forEach(([label, deg, r, size], i) => {
    const { x, y } = polar(r, deg);
    nodes.push({ id: `a${i}`, label, kind: "alert", x, y, size });
  });
  PROSPECTS.forEach(([label, deg, r, size], i) => {
    const { x, y } = polar(r, deg);
    nodes.push({ id: `p${i}`, label, kind: "prospect", x, y, size });
  });
  return nodes;
}

function buildEdges(): Array<[string, string]> {
  const edges: Array<[string, string]> = STABLES.map((_, i) => [HUB, `s${i}`]);
  edges.push(
    ["a0", "a1"],
    ["a2", "a3"],
    [HUB, "a0"],
    [HUB, "a2"],
    ["s1", "s0"],
    ["s6", "s0"],
    ["s4", "s3"],
    ["s5", "s7"],
    ["p0", "s1"],
    ["p1", "s4"],
    ["p2", "s2"],
    ["p3", "s5"],
    ["p4", "s5"],
    ["p5", "s7"],
    ["s2", "s0"],
  );
  return edges;
}

const NODES = buildNodes();
const EDGES = buildEdges();
const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

/* ------------------------------------------------------------------ */
/* Fallback estático (SVG) para entornos sin WebGL                     */
/* ------------------------------------------------------------------ */

function GraphFallback() {
  const CX = 250;
  const CY = 170;
  const KX = 72;
  const KY = 46;
  const px = (x: number) => CX + x * KX;
  const py = (y: number) => CY + y * KY;

  return (
    <svg
      viewBox="0 0 500 340"
      className="h-full w-full"
      role="img"
      aria-label="Red de clientes, alertas de fuga y prospectos de Black Sheep Field"
    >
      {EDGES.map(([a, b]) => {
        const na = NODE_BY_ID.get(a);
        const nb = NODE_BY_ID.get(b);
        if (!na || !nb) return null;
        return (
          <line
            key={`${a}-${b}`}
            x1={px(na.x)}
            y1={py(na.y)}
            x2={px(nb.x)}
            y2={py(nb.y)}
            stroke={EDGE_COLOR}
            strokeWidth="1.4"
          />
        );
      })}

      {NODES.map((node) => (
        <g key={node.id}>
          {node.kind === "hub" && (
            <circle
              cx={px(node.x)}
              cy={py(node.y)}
              r={node.size + 11}
              fill="none"
              stroke={COLORS.hub}
              strokeOpacity="0.35"
              strokeWidth="1.5"
            />
          )}
          <circle
            cx={px(node.x)}
            cy={py(node.y)}
            r={node.size * 0.95}
            fill={COLORS[node.kind]}
          />
          <text
            x={px(node.x)}
            y={py(node.y) - node.size - 6}
            textAnchor="middle"
            fontSize={node.kind === "hub" ? 11 : 8.5}
            fontWeight={node.kind === "hub" ? 800 : 600}
            fill={node.kind === "hub" ? "#ffffff" : "#a3b1cc"}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Grafo Sigma interactivo                                             */
/* ------------------------------------------------------------------ */

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    /* ---------- 1. Construcción del grafo ---------- */
    const graph = new Graph();
    const baseColor = new Map<string, string>();
    const baseSize = new Map<string, number>();

    NODES.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        x: node.x,
        y: node.y,
        size: node.size,
        color: COLORS[node.kind],
      });
      baseColor.set(node.id, COLORS[node.kind]);
      baseSize.set(node.id, node.size);
    });
    EDGES.forEach(([a, b]) => graph.addEdge(a, b, { color: EDGE_COLOR, size: 1 }));

    /* ---------- 2. Instancia Sigma (protegida) ---------- */
    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container, {
        renderLabels: true,
        renderEdgeLabels: false,
        labelColor: { color: "rgba(226, 232, 255, 0.92)" },
        labelSize: 11,
        labelWeight: "600",
        labelFont: "'Space Grotesk', 'Inter', ui-sans-serif, sans-serif",
        defaultEdgeColor: EDGE_COLOR,
        stagePadding: 26,
        minCameraRatio: 0.55,
        maxCameraRatio: 3,
      });
    } catch (error) {
      console.error("[NetworkGraph] WebGL no disponible, usando fallback:", error);
      setFallback(true);
      return;
    }

    /* ---------- 3. Interacciones de hover ---------- */
    let hovered: string | null = null;
    let hoveredNeighbors: Set<string> | null = null;

    sigma.setSetting("nodeReducer", (node, data) => {
      if (!hovered) {
        return { ...data, label: node === HUB ? data.label : "" };
      }
      if (node === hovered || hoveredNeighbors?.has(node)) {
        return { ...data, label: node === hovered ? data.label : "" };
      }
      return { ...data, label: "", color: DIM_COLOR };
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      if (!hovered) return data;
      if (graph.hasExtremity(edge, hovered)) {
        return { ...data, color: "#4318ff", size: 1.6 };
      }
      return { ...data, color: "rgba(43, 54, 116, 0.16)", size: 0.6 };
    });

    sigma.on("enterNode", ({ node }) => {
      hovered = node;
      hoveredNeighbors = new Set(graph.neighbors(node));
      container.style.cursor = "pointer";
      sigma.refresh();
    });
    sigma.on("leaveNode", () => {
      hovered = null;
      hoveredNeighbors = null;
      container.style.cursor = "grab";
      sigma.refresh();
    });

    /* ---------- 4. Vida: deriva, pulsos y cámara ---------- */
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const basePos = new Map<string, { x: number; y: number }>();
    graph.forEachNode((n, attrs) =>
      basePos.set(n, { x: attrs.x as number, y: attrs.y as number }),
    );

    let raf = 0;
    if (!reduceMotion) {
      const tick = (t: number) => {
        const time = t / 1000;
        graph.forEachNode((n) => {
          const b = basePos.get(n);
          if (!b) return;
          const seed = n.charCodeAt(0) * 0.71 + n.length * 1.37;
          graph.setNodeAttribute(n, "x", b.x + Math.sin(time * 0.32 + seed) * 0.07);
          graph.setNodeAttribute(n, "y", b.y + Math.cos(time * 0.26 + seed * 1.3) * 0.07);
        });
        graph.setNodeAttribute(HUB, "size", 13 + Math.sin(time * 2.1) * 1.3);
        sigma.refresh();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    /* Pulsos de eventos */
    const pulseCandidates = [
      "a0", "a1", "a2", "a3",
      "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
    ];
    const pulseTimers: ReturnType<typeof setTimeout>[] = [];
    let cleanupExtra: () => void;
    if (!reduceMotion) {
      const pulse = () => {
        const n =
          pulseCandidates[Math.floor(Math.random() * pulseCandidates.length)];
        const color = n.startsWith("a") ? "#ee5d50" : "#ffb547";
        graph.setNodeAttribute(n, "color", color);
        graph.setNodeAttribute(n, "size", (baseSize.get(n) ?? 6) + 2.2);
        sigma.refresh();
        const to = setTimeout(() => {
          graph.setNodeAttribute(n, "color", baseColor.get(n) ?? COLORS.stable);
          graph.setNodeAttribute(n, "size", baseSize.get(n) ?? 6);
          sigma.refresh();
        }, 1500);
        pulseTimers.push(to);
      };
      pulseTimers.push(setTimeout(pulse, 1600));
      const pulseInterval = setInterval(pulse, 3400);

      /* Respiración de cámara */
      let interacting = false;
      let releaseTimer: ReturnType<typeof setTimeout> | null = null;
      const onDown = () => {
        interacting = true;
        if (releaseTimer) clearTimeout(releaseTimer);
      };
      const onUp = () => {
        releaseTimer = setTimeout(() => {
          interacting = false;
        }, 2600);
      };
      container.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      sigma.getCamera().setState({ ratio: 2.35 });
      sigma.getCamera().animate(
        { ratio: 1.12 },
        {
          duration: 1900,
          easing: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
        },
      );
      let zoomedIn = false;
      const breathe = setInterval(() => {
        if (interacting || document.hidden) return;
        zoomedIn = !zoomedIn;
        sigma.getCamera().animate(
          {
            ratio: zoomedIn ? 0.94 : 1.12,
            angle: zoomedIn ? 0.026 : -0.026,
          },
          {
            duration: 4600,
            easing: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
          },
        );
      }, 9000);

      cleanupExtra = () => {
        clearInterval(pulseInterval);
        clearInterval(breathe);
        container.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        if (releaseTimer) clearTimeout(releaseTimer);
      };
    } else {
      sigma.getCamera().setState({ ratio: 1.05 });
      cleanupExtra = () => undefined;
    }

    const onResize = () => sigma.resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      pulseTimers.forEach(clearTimeout);
      cleanupExtra();
      window.removeEventListener("resize", onResize);
      sigma.kill();
    };
  }, []);

  if (fallback) return <GraphFallback />;

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      role="img"
      aria-label="Simulación interactiva de la red de clientes, alertas de fuga y prospectos de Black Sheep Field"
    />
  );
}
