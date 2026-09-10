export type PuntoMapa = {
  id: string;
  nombre: string;
  /** posición relativa dentro del "terreno" (-1..1). Reemplazar por proyección real lat/lng cuando se integre un mapa geográfico real. */
  x: number;
  z: number;
  estado: "visita" | "riesgo";
};

/**
 * Datos de ejemplo. Reemplazar por los puntos reales
 * (por ejemplo, mapeando lat/lng de clientes/prospectos en RM a este rango -1..1,
 * o pasando directamente coordenadas reales si se integra un proveedor de mapas).
 */
export const puntosDemo: PuntoMapa[] = [
  { id: "p1", nombre: "Ñuñoa", x: -0.3, z: 0.2, estado: "visita" },
  { id: "p2", nombre: "Providencia", x: -0.1, z: -0.1, estado: "visita" },
  { id: "p3", nombre: "Las Condes", x: 0.35, z: -0.25, estado: "visita" },
  { id: "p4", nombre: "Maipú", x: -0.6, z: 0.45, estado: "riesgo" },
  { id: "p5", nombre: "La Florida", x: 0.15, z: 0.55, estado: "visita" },
  { id: "p6", nombre: "Independencia", x: -0.05, z: -0.5, estado: "visita" },
  { id: "p7", nombre: "Puente Alto", x: 0.5, z: 0.6, estado: "riesgo" },
  { id: "p8", nombre: "Recoleta", x: 0.02, z: -0.4, estado: "visita" },
  { id: "p9", nombre: "San Miguel", x: -0.2, z: 0.35, estado: "visita" },
  { id: "p10", nombre: "Vitacura", x: 0.45, z: -0.5, estado: "visita" },
];
