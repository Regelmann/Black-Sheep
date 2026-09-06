import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad.
 *
 * El sitio público es la puerta de entrada: no maneja datos de clientes,
 * pero es el origen que más se comparte y el que un atacante usa para
 * montar un iframe o robarse el formulario de leads.
 *
 * `Referrer-Policy: strict-origin-when-cross-origin` importa por una razón
 * concreta: el link del catálogo lleva el token en la URL
 * (`/catalogo/<token>`). Sin esta cabecera, cualquier enlace saliente
 * filtra el token completo en la cabecera Referer.
 */
const CSP = [
  "default-src 'self'",
  // Next inyecta el payload de hidratación en un script inline: sin
  // 'unsafe-inline' el sitio no arranca. Es el único concesión de esta
  // política y se compensa con el resto de las directivas.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // No anunciar la versión del framework en cada respuesta.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },

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
  async redirects() {
    return [
      { source: "/login",     destination: "https://app.black-sheep.cl/", permanent: true },

      { source: "/app",       destination: "https://app.black-sheep.cl/", permanent: true },
    ];
  },
};

export default nextConfig;
