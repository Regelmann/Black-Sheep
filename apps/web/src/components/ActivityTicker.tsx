"use client";

export type EventoActividad = {
  texto: string;
  zona: string;
  hace: string;
};

const eventosDemo: EventoActividad[] = [
  { texto: "Pedido cerrado", zona: "Ñuñoa", hace: "hace 2 min" },
  { texto: "Ruta reoptimizada", zona: "Maipú", hace: "hace 4 min" },
  { texto: "Alerta de fuga resuelta", zona: "San Miguel", hace: "hace 6 min" },
  { texto: "Pedido cerrado", zona: "Providencia", hace: "hace 9 min" },
  { texto: "Nuevo prospecto agregado", zona: "Quilicura", hace: "hace 11 min" },
  { texto: "Visita completada", zona: "Vitacura", hace: "hace 13 min" },
  { texto: "Pedido cerrado", zona: "La Florida", hace: "hace 15 min" },
  { texto: "Acuerdo actualizado", zona: "Recoleta", hace: "hace 18 min" },
];

/**
 * ActivityTicker
 * Cinta infinita (mismo patrón que animate-marquee de globals.css) con eventos
 * de la operación en vivo. Va bien justo antes o dentro de la sección "Terreno",
 * como refuerzo antes de llegar al mapa 3D.
 *
 * Uso:
 *   <ActivityTicker />                    // usa eventos de ejemplo
 *   <ActivityTicker eventos={misEventos} />  // datos reales (websocket, polling, etc.)
 */
export default function ActivityTicker({
  eventos = eventosDemo,
}: {
  eventos?: EventoActividad[];
}) {
  const track = [...eventos, ...eventos]; // duplicado para loop continuo

  return (
    <div className="bs-ticker" role="marquee" aria-label="Actividad en vivo de la red">
      <div className="bs-ticker-track">
        {track.map((e, i) => (
          <span className="bs-ticker-item" key={i}>
            <span className="bs-ticker-dot" />
            {e.texto} en <strong>{e.zona}</strong>
            <span className="bs-ticker-time"> · {e.hace}</span>
          </span>
        ))}
      </div>

      <style jsx>{`
        .bs-ticker {
          width: 100%;
          overflow: hidden;
          border-top: 1px solid rgba(57, 255, 20, 0.14);
          border-bottom: 1px solid rgba(57, 255, 20, 0.14);
          background: #050705;
          padding: 0.8rem 0;
          -webkit-mask-image: linear-gradient(
            90deg,
            transparent,
            #000 6%,
            #000 94%,
            transparent
          );
          mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
        }
        .bs-ticker-track {
          display: flex;
          width: max-content;
          gap: 2.5rem;
          animation: bs-marquee 38s linear infinite;
        }
        .bs-ticker-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.82rem;
          color: #8fa38f;
          white-space: nowrap;
        }
        .bs-ticker-item strong {
          color: #eafbea;
          font-weight: 600;
        }
        .bs-ticker-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #39ff14;
          box-shadow: 0 0 8px #39ff14;
          flex-shrink: 0;
        }
        .bs-ticker-time {
          color: #5c6e5c;
        }
        @keyframes bs-marquee {
          to {
            transform: translateX(-50%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bs-ticker-track {
            animation: none;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
