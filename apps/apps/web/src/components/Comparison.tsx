import { Check, X } from "lucide-react";
import Reveal from "@/components/Reveal";

const ROWS: Array<{ label: string; before: string; after: string }> = [
  {
    label: "Toma de pedidos",
    before: "Audio de WhatsApp y foto del catálogo; se digita después en la oficina",
    after: "Carrito en 40 segundos con stock y precio real, directo a bodega",
  },
  {
    label: "Precios",
    before: "Planilla Excel desactualizada y “déjame llamar para confirmar”",
    after: "Tres listas + acuerdos por cliente, con tope de margen al instante",
  },
  {
    label: "Ruta del día",
    before: "Cada vendedor decide a dónde ir según costumbre",
    after: "Ordenada por potencial, urgencia de reposición y kilómetros",
  },
  {
    label: "Riesgo de fuga",
    before: "Se descubre cuando el cliente ya lleva meses comprándole a otro",
    after: "Alerta automática a los 21 días sin pedir o ante caída de volumen",
  },
  {
    label: "Control gerencial",
    before: "El panorama real se consolida el fin de semana, en planillas",
    after: "Tablero en vivo, minuto a minuto, desde cualquier lugar",
  },
  {
    label: "Memoria comercial",
    before: "Vive en el celular personal del vendedor",
    after: "Vive en la empresa — historial, acuerdos y contactos para siempre",
  },
];

export default function Comparison() {
  return (
    <section className="relative w-full border-y border-line/40 bg-navy-deep/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-24">
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            El cambio
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Tu operación hoy vs{" "}
            <span className="text-gradient">con Black Sheep</span>
          </h2>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-14 overflow-hidden rounded-3xl border border-line/60 bg-card/35 backdrop-blur-sm">
            {/* Encabezados */}
            <div className="grid grid-cols-1 gap-4 border-b border-line/60 bg-navy-deep/70 px-6 py-5 sm:grid-cols-[1fr_1.15fr_1.15fr] sm:gap-8">
              <span className="hidden font-display text-[11px] font-bold tracking-[0.24em] text-ink/60 uppercase sm:block">
                Proceso
              </span>
              <span className="flex items-center gap-2 font-display text-[11px] font-bold tracking-[0.24em] text-rose uppercase">
                <X size={13} strokeWidth={3} /> Tu operación hoy
              </span>
              <span className="flex items-center gap-2 font-display text-[11px] font-bold tracking-[0.24em] text-mint uppercase">
                <Check size={13} strokeWidth={3} /> Con Black Sheep Field
              </span>
            </div>

            {ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-1 gap-3 px-6 py-5 transition-colors hover:bg-panel/25 sm:grid-cols-[1fr_1.15fr_1.15fr] sm:gap-8 ${
                  i !== ROWS.length - 1 ? "border-b border-line/40" : ""
                }`}
              >
                <p className="font-display text-sm font-bold text-white">
                  {row.label}
                </p>
                <p className="flex items-start gap-2.5 text-xs leading-relaxed text-ink">
                  <X
                    size={14}
                    strokeWidth={3}
                    className="mt-0.5 shrink-0 text-rose/80"
                  />
                  {row.before}
                </p>
                <p className="flex items-start gap-2.5 text-xs leading-relaxed font-medium text-mist">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-mint/15">
                    <Check size={10} strokeWidth={3.5} className="text-mint" />
                  </span>
                  {row.after}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
