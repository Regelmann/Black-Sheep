import { Clock, FileSpreadsheet, MessageCircle, TrendingDown } from "lucide-react";
import Reveal from "@/components/Reveal";

const PAINS = [
  {
    icon: FileSpreadsheet,
    number: "12%",
    title: "de los pedidos manuales llegan con error a bodega",
    body: "“20 unid del 884” digitado como 12, precio de la planilla vieja, SKU confundido. Cada error es un reproceso, un reclamo y un cliente que desconfía.",
  },
  {
    icon: Clock,
    number: "10 h/sem",
    title: "pierde la jefatura consolidando WhatsApp y Excel",
    body: "Cruzar audios, fotos de cuadernos y planillas para saber qué pasó en terreno. La semana se va en armar el reporte, no en vender.",
  },
  {
    icon: MessageCircle,
    number: "1 de 5",
    title: "clientes en riesgo se va sin que nadie lo note",
    body: "Bajó el volumen, estiró su ritmo de pedido y nadie vio la señal. Cuando se detecta, la fuga ya es un hecho.",
  },
  {
    icon: TrendingDown,
    number: "0",
    title: "memoria comercial queda cuando el vendedor renuncia",
    body: "Los acuerdos, los contactos y el historial vivían en su WhatsApp personal. El conocimiento de tu cartera se fue con él.",
  },
];

export default function ProblemCost() {
  return (
    <section className="relative w-full">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-rose uppercase">
            El costo invisible
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Vender en terreno con WhatsApp
            <br />y Excel <span className="text-gradient">cuesta fortunas</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            No aparece como línea en tu balance, pero cada semana sin sistema tu
            operación pierde plata en errores, horas y clientes que se van en
            silencio.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PAINS.map((pain, i) => (
            <Reveal key={pain.number} delay={i * 0.08} className="h-full">
              <div className="group flex h-full flex-col rounded-3xl border border-line/60 bg-card/40 p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-rose/35">
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-panel p-3 text-rose transition-transform duration-300 group-hover:scale-110">
                    <pain.icon size={19} />
                  </span>
                </div>
                <p className="mt-6 font-display text-4xl font-black tracking-tight text-white">
                  {pain.number}
                </p>
                <h3 className="mt-2 text-sm leading-snug font-bold text-mist">
                  {pain.title}
                </h3>
                <p className="mt-2.5 text-xs leading-relaxed text-ink">
                  {pain.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="mt-12 text-center font-display text-sm font-bold tracking-wide text-ink">
            La buena noticia:{" "}
            <span className="text-mist">
              los cuatro puntos se arreglan con una sola app en el bolsillo ↓
            </span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
