"use client";

import dynamic from "next/dynamic";

// WebGL (Three.js) no puede renderizarse en el servidor.
const MapaChileRM = dynamic(() => import("./MapaChileRM"), { ssr: false });

export default function MapaChileRMSection() {
  return <MapaChileRM />;
}
