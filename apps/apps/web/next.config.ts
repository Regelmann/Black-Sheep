import type { NextConfig } from "next";

/**
 * Redirecciones heredadas de la web anterior (apps/web).
 *
 * `login.html` y `dashboard.html` eran archivos de 16-23 líneas que sólo
 * redirigían a la app de terreno. Si desaparecen, cualquier link viejo
 * —un mail, un marcador, un QR impreso— muere en un 404.
 *
 * Se conservan como redirect 308 (permanente) para que Google también
 * actualice su índice.
 */
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/login",     destination: "https://app.black-sheep.cl/", permanent: true },

      { source: "/app",       destination: "https://app.black-sheep.cl/", permanent: true },
    ];
  },
};

export default nextConfig;
