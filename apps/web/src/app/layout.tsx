import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

/**
 * Las fuentes se cargan por <link>, NO con `next/font/google`.
 *
 * `next/font/google` las descarga en tiempo de BUILD. Si Google no
 * responde —corte de red en el runner, bloqueo regional, timeout— el
 * deploy entero falla con "Failed to fetch Space Grotesk".
 *
 * Un sitio comercial no puede quedar sin desplegar porque un CDN de
 * fuentes tuvo un mal minuto. Con <link> + `display=swap`, si las
 * fuentes no cargan el sitio se ve con la del sistema y se publica igual.
 */
const inter = { variable: "font-inter" };
const spaceGrotesk = { variable: "font-space" };

export const metadata: Metadata = {
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
        {/* Favicon: el logo real. La web no tenía ninguno — el navegador
            mostraba el ícono genérico de página en la pestaña. */}
        <link rel="icon" type="image/png" sizes="32x32" href="/logo-mark-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/logo-mark-192.png" />
        <link rel="apple-touch-icon" href="/logo-mark-180.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Space+Grotesk:wght@500;700&display=swap"
        />
      </head>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-navy text-mist antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
