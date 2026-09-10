"use client";

export type PropuestaData = {
  vendedores: number;
  pedidosPorVendedorSemana: number;
  ticketPromedio: number;
  ventasMensualesActuales: number;
  impactoMensual: number;
  planSugerido: "Campo" | "Comando";
  precioPlanMensual: number;
};

function formatoCLP(n: number) {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function construirHTML(d: PropuestaData) {
  const fecha = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
  return `
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Propuesta Black Sheep Field</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#111;padding:48px;max-width:720px;margin:0 auto;}
      h1{font-size:22px;margin-bottom:4px;}
      .sub{color:#555;font-size:13px;margin-bottom:32px;}
      .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px;}
      .row.total{font-weight:700;font-size:16px;border-bottom:none;border-top:2px solid #111;margin-top:8px;padding-top:14px;}
      .accent{color:#0a7a2f;font-weight:700;}
      .plan{margin-top:28px;padding:16px 20px;border:1px solid #ddd;border-radius:10px;}
      .foot{margin-top:40px;font-size:11px;color:#888;}
    </style>
  </head>
  <body>
    <h1>Propuesta — Black Sheep Field</h1>
    <div class="sub">Generada el ${fecha} a partir de tu operación actual</div>

    <div class="row"><span>Vendedores en terreno</span><span>${d.vendedores}</span></div>
    <div class="row"><span>Pedidos por vendedor / semana</span><span>${d.pedidosPorVendedorSemana}</span></div>
    <div class="row"><span>Ticket promedio por pedido</span><span>${formatoCLP(d.ticketPromedio)}</span></div>
    <div class="row"><span>Ventas mensuales estimadas actuales</span><span>${formatoCLP(d.ventasMensualesActuales)}</span></div>
    <div class="row total"><span>Impacto mensual estimado con Black Sheep</span><span class="accent">${formatoCLP(d.impactoMensual)}</span></div>

    <div class="plan">
      <strong>Plan sugerido: ${d.planSugerido}</strong><br/>
      <span style="font-size:13px;color:#555">${formatoCLP(d.precioPlanMensual)} /mes + IVA (facturación anual)</span>
    </div>

    <div class="foot">
      Estimación referencial con supuestos conservadores. No constituye garantía de resultados.
      Black Sheep Field · hola@black-sheep.cl · +56 9 3218 8569
    </div>
  </body>
  </html>`;
}

/**
 * PropuestaDownloadButton
 * Toma los valores actuales de la calculadora de impacto y abre una ventana de
 * impresión con un resumen de una página ("Guardar como PDF" en el diálogo del
 * navegador). Sin dependencias nuevas — no requiere librerías de generación de PDF.
 *
 * Uso dentro de la sección de la calculadora, pasando los valores en vivo de los
 * sliders:
 *
 *   <PropuestaDownloadButton data={{
 *     vendedores, pedidosPorVendedorSemana, ticketPromedio,
 *     ventasMensualesActuales, impactoMensual,
 *     planSugerido: vendedores <= 5 ? "Campo" : "Comando",
 *     precioPlanMensual: ...,
 *   }} />
 */
export default function PropuestaDownloadButton({ data }: { data: PropuestaData }) {
  function handleClick() {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(construirHTML(data));
    w.document.close();
    w.focus();
    // pequeño delay para que el navegador termine de pintar antes de imprimir
    setTimeout(() => w.print(), 300);
  }

  return (
    <button className="bs-propuesta-btn" onClick={handleClick} type="button">
      Descargar propuesta
      <style jsx>{`
        .bs-propuesta-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          color: #39ff14;
          border: 1px solid rgba(57, 255, 20, 0.4);
          border-radius: 999px;
          padding: 0.65rem 1.3rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .bs-propuesta-btn:hover {
          background: rgba(57, 255, 20, 0.08);
          border-color: rgba(57, 255, 20, 0.7);
        }
      `}</style>
    </button>
  );
}
