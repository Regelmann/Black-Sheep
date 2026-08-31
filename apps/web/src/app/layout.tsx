import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

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
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-navy text-mist antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
