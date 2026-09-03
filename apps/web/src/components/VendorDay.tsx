import {
  Clock,
  Ellipsis,
  MapPin,
  Route as RouteIcon,
  ShoppingCart,
  Users,
  Zap,
} from "lucide-react";
import Reveal from "@/components/Reveal";

const TIMELINE = [
  {
    time: "07:45",
    title: "La app genera el día",
    body: "Ruta ordenada por potencial y urgencia de reposición. 9 visitas, 74 km, cero planificación manual.",
  },
  {
    time: "09:20",
    title: "KeyFoods Central",
    body: "NBA sugerida: reponer el stock crítico del SKU más vendido antes del fin de semana. Venta $1.240.000.",
  },
  {
    time: "11:05",
    title: "Pedido confirmado",
    body: "Carrito en 40 segundos con acuerdo Lista 3. Aprobado por regla y enviado directo a bodega.",
  },
  {
    time: "14:30",
    title: "Alerta de fuga",
    body: "Local Providencia lleva 21 días sin pedir y bajó 24% su volumen. Se agenda visita de recuperación.",
  },
  {
    time: "17:10",
    title: "Cierre del día",
    body: "9/9 visitas, 6 pedidos y $4,2M gestionados. El resumen llega solo a la gerencia.",
  },
];

function PhoneMock() {
  return (
    <div className="relative mx-auto w-[300px]">
      {/* Glow trasero */}
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[3.5rem] bg-gradient-to-b from-primary/25 via-primary/8 to-transparent blur-2xl"
      />

      <div className="relative rounded-[2.6rem] border border-line bg-navy-deep p-2.5 shadow-[0_50px_100px_-30px_rgba(3,7,26,1)]">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-b from-card to-navy-deep">
          {/* Notch + hora */}
          <div className="flex items-center justify-between px-6 pt-3.5 pb-1 text-[10px] font-semibold text-ink">
            <span>07:45</span>
            <span className="h-4 w-20 rounded-full border border-line/60 bg-navy-deep" />
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              5G
            </span>
          </div>

          {/* Header app */}
          <div className="flex items-center justify-between px-5 pt-3 pb-4">
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-ink/70 uppercase">
                Hoy · Mar 24
              </p>
              <p className="font-display text-base font-black text-white">
                Hola, Camilo
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-soft font-display text-[11px] font-black text-white">
              CR
            </span>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2.5 px-5">
            <div className="rounded-2xl border border-line/50 bg-navy/70 p-3">
              <p className="text-[9px] font-bold tracking-widest text-ink uppercase">
                Visitas
              </p>
              <p className="mt-0.5 font-display text-lg font-black text-white">
                6<span className="text-ink/60">/9</span>
              </p>
              <div className="mt-1.5 h-1 rounded-full bg-panel">
                <div className="h-1 w-2/3 rounded-full bg-gradient-to-r from-sky to-primary-soft" />
              </div>
            </div>
            <div className="rounded-2xl border border-line/50 bg-navy/70 p-3">
              <p className="text-[9px] font-bold tracking-widest text-ink uppercase">
                Venta del día
              </p>
              <p className="mt-0.5 font-display text-lg font-black text-white">
                $4,2M
              </p>
              <div className="mt-1.5 h-1 rounded-full bg-panel">
                <div className="h-1 w-4/5 rounded-full bg-gradient-to-r from-mint to-sky" />
              </div>
            </div>
          </div>

          {/* NBA destacada */}
          <div className="mx-5 mt-3 rounded-2xl border border-mint/25 bg-mint/8 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 rounded-md bg-mint/15 px-2 py-0.5 text-[9px] font-black tracking-widest text-mint uppercase">
                <Zap size={9} /> Foco prioritario
              </span>
              <span className="text-[9px] font-semibold text-ink">09:20</span>
            </div>
            <p className="mt-2 text-xs font-bold text-white">
              Reponer stock crítico
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink">
              <MapPin size={9} /> KeyFoods Central · SKU 0884
            </p>
            <div className="mt-2.5 grid h-8 place-items-center rounded-lg bg-mint text-[11px] font-black text-navy-deep">
              Iniciar visita
            </div>
          </div>

          {/* Lista de visitas */}
          <div className="space-y-2 px-5 py-3.5">
            {[
              { t: "11:05", n: "Distribuidora Andes", tag: "Confirmado", tone: "text-mint bg-mint/12" },
              { t: "13:40", n: "Panadería Central", tag: "En ruta", tone: "text-sky bg-sky/12" },
              { t: "15:15", n: "Almacén El Trébol", tag: "Pendiente", tone: "text-ink bg-panel" },
            ].map((v) => (
              <div
                key={v.n}
                className="flex items-center justify-between rounded-xl border border-line/45 bg-navy/60 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-display text-[10px] font-bold text-ink/80 tabular-nums">
                    {v.t}
                  </span>
                  <span className="text-[11px] font-semibold text-mist">
                    {v.n}
                  </span>
                </div>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[8.5px] font-black tracking-wide uppercase ${v.tone}`}
                >
                  {v.tag}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around border-t border-line/40 px-5 py-3">
            <RouteIcon size={17} className="text-primary-soft" />
            <ShoppingCart size={17} className="text-ink/60" />
            <Users size={17} className="text-ink/60" />
            <Ellipsis size={17} className="text-ink/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VendorDay() {
  return (
    <section className="relative w-full overflow-hidden border-y border-line/40 bg-navy-deep/40">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 px-6 py-24 lg:grid-cols-[1fr_auto]">
        {/* Timeline */}
        <div>
          <Reveal className="max-w-xl space-y-4">
            <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
              En terreno
            </span>
            <h2 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
              Un día de terreno,
              <br />
              de <span className="text-gradient">punta a punta</span>
            </h2>
            <p className="text-base leading-relaxed text-ink">
              Nada se le olvida al vendedor; nada se le escapa a la gerencia.
              Cada visita deja un rastro operativo que el sistema convierte en
              la siguiente acción.
            </p>
          </Reveal>

          <div className="relative mt-12 ml-2 space-y-9">
            <div
              aria-hidden
              className="absolute top-1 bottom-1 left-[7px] w-px bg-gradient-to-b from-primary/60 via-line to-transparent"
            />
            {TIMELINE.map((item, i) => (
              <Reveal key={item.time} delay={i * 0.08}>
                <div className="relative flex gap-5 pl-8">
                  <span className="absolute top-1 left-0 grid h-[15px] w-[15px] place-items-center">
                    <span
                      className={`h-[15px] w-[15px] rounded-full border-2 ${
                        i === 3
                          ? "border-rose bg-rose/25"
                          : "border-primary-soft bg-primary/25"
                      }`}
                    />
                    <span
                      className={`absolute h-[5px] w-[5px] rounded-full ${
                        i === 3 ? "bg-rose" : "bg-primary-soft"
                      }`}
                    />
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-display text-xs font-bold tracking-widest text-ink/80 tabular-nums">
                      <Clock size={11} className="text-ink/60" />
                      {item.time}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-white">
                      {item.title}
                    </h3>
                    <p className="mt-1 max-w-md text-sm leading-relaxed text-ink">
                      {item.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Mockup del teléfono */}
        <Reveal delay={0.15} className="justify-self-center">
          <div className="animate-floaty-slow">
            <PhoneMock />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
