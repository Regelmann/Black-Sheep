import {
  AlertTriangle,
  CircleDollarSign,
  Database,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Target,
  WifiOff,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import Stagger from "@/components/Stagger";
import Tilt from "@/components/Tilt";

const CHIPS = [
  { icon: WifiOff, label: "Modo offline real" },
  { icon: RefreshCw, label: "Sync con tu ERP · Softland, Defontana" },
  { icon: Database, label: "API abierta y webhooks" },
  { icon: ShieldCheck, label: "Datos cifrados y respaldados" },
];

export default function BentoFeatures() {
  return (
    <section id="funciones" className="relative w-full">
      <div className="mx-auto w-full max-w-7xl space-y-12 px-6 py-24">
        {/* Encabezado */}
        <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Producto
          </span>
          <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Todo el día del vendedor,
            <br />
            en una sola <span className="text-gradient">interfaz viva</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Saca los archivos de Excel del terreno. Cada mañana a las 07:45 el
            sistema prioriza las acciones comerciales de mayor valor y se las
            sirve listas a cada vendedor.
          </p>
        </Reveal>

        {/* Grid asimétrico estilo Bento */}
        <div className="grid auto-rows-[232px] grid-cols-1 gap-5 md:grid-cols-3">
          {/* 1. Próxima acción (doble ancho) */}
          <Reveal className="md:col-span-2">
            <Tilt max={5}>
              <div className="group flex h-full flex-col justify-between rounded-3xl border border-line/60 bg-card/45 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-mint/35">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <span className="rounded-md border border-mint/25 bg-mint/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-mint uppercase">
                      Algoritmo inteligente
                    </span>
                    <h3 className="pt-1 font-display text-xl font-bold text-white">
                      Próxima acción
                    </h3>
                  </div>
                  <div className="rounded-xl bg-panel p-3 text-mint transition-transform duration-300 group-hover:scale-110">
                    <Target size={20} />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between rounded-xl border border-line/70 bg-navy/85 p-3 text-xs">
                    <span className="font-semibold text-mist">
                      1. Reponer stock crítico — Restaurante Aurora
                    </span>
                    <span className="shrink-0 pl-3 font-bold text-mint">
                      Foco prioritario
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-line/40 bg-navy/45 p-3 text-xs text-ink/60">
                    <span className="line-through">
                      2. Recuperar SKUs atrasados — Local Providencia
                    </span>
                    <span className="shrink-0 pl-3">Completado</span>
                  </div>
                </div>
              </div>
            </Tilt>
          </Reveal>

          {/* 2. Riesgo de Fuga */}
          <Reveal delay={0.08}>
            <Tilt max={6}>
              <div className="group flex h-full flex-col justify-between rounded-3xl border border-line/60 bg-card/45 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-rose/35">
                <div className="flex items-start justify-between">
                  <h3 className="font-display text-xl font-bold text-white">
                    Riesgo de fuga
                  </h3>
                  <div className="rounded-xl bg-panel p-3 text-rose transition-transform duration-300 group-hover:scale-110">
                    <AlertTriangle size={20} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-display text-4xl font-black tracking-tight text-rose">
                    −24%
                  </div>
                  <p className="text-xs leading-snug text-ink">
                    Alerta automática por caída drástica de volumen o quiebre en
                    el ritmo de pedidos recurrentes — antes de que el cliente se
                    vaya.
                  </p>
                </div>
              </div>
            </Tilt>
          </Reveal>

          {/* 3. Precios dinámicos */}
          <Reveal delay={0.04}>
            <Tilt max={6}>
              <div className="group flex h-full flex-col justify-between rounded-3xl border border-line/60 bg-card/45 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <h3 className="font-display text-xl font-bold text-white">
                    Precios dinámicos
                  </h3>
                  <div className="rounded-xl bg-panel p-3 text-primary-soft transition-transform duration-300 group-hover:scale-110">
                    <CircleDollarSign size={20} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between border-b border-line/50 pb-1.5 text-xs text-ink">
                    <span>Historial base</span>
                    <span className="font-semibold text-white">$12.500</span>
                  </div>
                  <div className="flex justify-between border-b border-line/50 py-1.5 text-xs text-ink">
                    <span>Acuerdo negociado</span>
                    <span className="font-bold text-mint">$10.900</span>
                  </div>
                  <p className="pt-2 text-[11px] leading-tight text-ink/70">
                    Tres listas y acuerdos por cliente. Control de margen en el
                    bolsillo, sin llamar a la oficina.
                  </p>
                </div>
              </div>
            </Tilt>
          </Reveal>

          {/* 4. Mapa + Prospectos (doble ancho) */}
          <Reveal delay={0.1} className="md:col-span-2">
            <Tilt max={5}>
              <div className="group flex h-full flex-col justify-between rounded-3xl border border-line/60 bg-card/45 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-sky/40">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-display text-xl font-bold text-white">
                      Mapa + Prospectos
                    </h3>
                    <p className="text-xs text-ink">
                      Ruta de visitas optimizada por zona geográfica y potencial.
                    </p>
                  </div>
                  <div className="rounded-xl bg-panel p-3 text-sky transition-transform duration-300 group-hover:scale-110">
                    <MapPin size={20} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-line/60 bg-navy/65 p-3">
                    <div className="text-[11px] font-bold text-ink">
                      Zona 2
                    </div>
                    <div className="mt-1 font-display text-base font-black text-white">
                      3.870
                    </div>
                  </div>
                  <div className="rounded-xl border border-line/60 bg-navy/65 p-3">
                    <div className="text-[11px] font-bold text-ink">Zona 3</div>
                    <div className="mt-1 font-display text-base font-black text-white">
                      3.627
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary/35 bg-navy/65 p-3 shadow-lg shadow-primary/10">
                    <div className="text-[11px] font-bold text-primary-soft">
                      Zona 1
                    </div>
                    <div className="mt-1 font-display text-base font-black text-white">
                      2.389
                    </div>
                  </div>
                </div>
              </div>
            </Tilt>
          </Reveal>
        </div>

        {/* Franja de capacidades técnicas */}
        <Reveal delay={0.05} variant="fade">
          <Stagger
            className="flex flex-wrap items-center justify-center gap-3"
            stagger={0.07}
          >
            {CHIPS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-2 rounded-full border border-line/50 bg-card/40 px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <Icon size={14} className="text-primary-soft" />
                {label}
              </span>
            ))}
          </Stagger>
        </Reveal>
      </div>
    </section>
  );
}
