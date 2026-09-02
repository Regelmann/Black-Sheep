import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Las fuentes van por <link>, NO por next/font/google.
 *
 * next/font las descarga en tiempo de BUILD: si Google no responde
 * —corte de red, timeout, bloqueo— el deploy entero falla con
 * "Failed to fetch Inter". Un sitio comercial no puede quedar sin
 * publicar porque un CDN de fuentes tuvo un mal minuto.
 *
 * Con <link> + display=swap, si no llegan se ve con la del sistema.
 */
const inter = { variable: "font-inter" };
const spaceGrotesk = { variable: "font-space" };



export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }, { url: "/brand/logo-mark-512.png", type: "image/png" }],
    apple: [{ url: "/brand/logo-mark-512.png" }],
  },
  metadataBase: new URL("https://www.black-sheep.cl"),
  title: "Black Sheep Field — Ruta, precio y pedido en terreno",
  description:
    "La plataforma de operación comercial que usa el vendedor en terreno y la gerencia en la oficina. Ruta optimizada, precios por cliente, pedidos y alertas de fuga en el bolsillo. Hecho para el terreno chileno.",
  keywords: [
    "venta directa",
    "preventa",
    "vendedores en terreno",
    "ruta de ventas",
    "Chile",
    "ERP",
    "distribuidoras",
  ],
  openGraph: {
    title: "Black Sheep Field — Ruta, precio y pedido en terreno",
    description:
      "Metas, focos, riesgo de fuga y pedidos sincronizados en el bolsillo del vendedor. Hecho para el terreno chileno.",
    url: "https://www.black-sheep.cl",
    siteName: "Black Sheep Field",
    locale: "es_CL",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CL">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/logo-mark-32.png" />
        <link rel="apple-touch-icon" href="/logo-mark-180.png" />
        {/* Fuentes por <link> (no next/font/google): que un timeout de
            Google no tumbe el deploy. Ver comentario arriba. */}
        {/* eslint-disable @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Space+Grotesk:wght@500;700&display=swap" />
        {/* eslint-enable @next/next/no-page-custom-font */}
      </head>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-navy text-mist antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
