"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Send,
  ShieldCheck,
  Timer,
} from "lucide-react";
import Reveal from "@/components/Reveal";

const TEAM_SIZES = ["1 vendedor", "2–5 vendedores", "6–15 vendedores", "16–50 vendedores", "Más de 50"];

type Status = "idle" | "sending" | "success" | "error";

export default function CTAForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [nombre, setNombre] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      nombre: String(data.get("nombre") ?? ""),
      empresa: String(data.get("empresa") ?? ""),
      email: String(data.get("email") ?? ""),
      telefono: String(data.get("telefono") ?? ""),
      tamanoEquipo: String(data.get("tamanoEquipo") ?? ""),
      mensaje: String(data.get("mensaje") ?? ""),
    };

    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Algo salió mal.");
      }

      setNombre(payload.nombre.trim().split(" ")[0] ?? "");
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No pudimos registrar tu solicitud.",
      );
    }
  }

  return (
    <section id="demo" className="relative w-full overflow-hidden">
      {/* Fondo de la sección */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/6 to-primary/10"
      />
      <div aria-hidden className="bg-grid mask-radial absolute inset-0 opacity-60" />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-6 py-24 lg:grid-cols-[1fr_1.08fr]">
        {/* Propuesta */}
        <Reveal className="max-w-xl space-y-7">
          <span className="text-xs font-bold tracking-[0.28em] text-primary-soft uppercase">
            Empieza hoy
          </span>
          <h2 className="font-display text-4xl leading-[1.02] font-black tracking-tight text-white sm:text-5xl">
            Ordena tu terreno
            <br />
            en <span className="text-gradient">2 semanas</span>
          </h2>
          <p className="text-base leading-relaxed text-ink">
            Agenda una demo de 30 minutos con un especialista. Muestranos tu
            operación y te mostramos cómo se vería tu ruta, tus precios y tus
            alertas — con tus datos reales.
          </p>

          <ul className="space-y-4 pt-2">
            <li className="flex items-start gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-mint/25 bg-mint/10 text-mint">
                <FileSpreadsheet size={16} />
              </span>
              <div>
                <p className="text-sm font-bold text-white">
                  Migramos tu Excel por ti
                </p>
                <p className="mt-0.5 text-xs text-ink">
                  Clientes, listas de precios y acuerdos — listos en la semana 1.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky/25 bg-sky/10 text-sky">
                <Timer size={16} />
              </span>
              <div>
                <p className="text-sm font-bold text-white">
                  Respuesta en menos de 24 h hábiles
                </p>
                <p className="mt-0.5 text-xs text-ink">
                  Te contactamos por correo o WhatsApp, como te acomode.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary-soft">
                <ShieldCheck size={16} />
              </span>
              <div>
                <p className="text-sm font-bold text-white">
                  Sin tarjeta ni compromiso
                </p>
                <p className="mt-0.5 text-xs text-ink">
                  La demo es gratuita y tus datos quedan protegidos.
                </p>
              </div>
            </li>
          </ul>
        </Reveal>

        {/* Formulario */}
        <Reveal delay={0.12}>
          <div className="glow-primary relative overflow-hidden rounded-3xl border border-line/70 bg-card/70 p-7 backdrop-blur-md sm:p-9">
            {status === "success" ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center space-y-4 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl border border-mint/30 bg-mint/10 text-mint">
                  <CheckCircle2 size={30} />
                </span>
                <h3 className="font-display text-2xl font-black text-white">
                  ¡Listo{nombre ? `, ${nombre}` : ""}!
                </h3>
                <p className="max-w-sm text-sm leading-relaxed text-ink">
                  Recibimos tu solicitud. Un especialista de Black Sheep te
                  contactará dentro del próximo día hábil para agendar tu demo.
                </p>
                <p className="pt-2 text-[11px] font-semibold tracking-widest text-ink/60 uppercase">
                  Mientras tanto, tu terreno nos espera
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-mist/90">
                      Nombre <span className="text-primary-soft">*</span>
                    </span>
                    <input
                      required
                      name="nombre"
                      autoComplete="name"
                      placeholder="Camila Rojas"
                      className="field"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-mist/90">Empresa</span>
                    <input
                      name="empresa"
                      autoComplete="organization"
                      placeholder="Distribuidora SpA"
                      className="field"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-mist/90">
                      Correo <span className="text-primary-soft">*</span>
                    </span>
                    <input
                      required
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="camila@empresa.cl"
                      className="field"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-mist/90">Teléfono / WhatsApp</span>
                    <input
                      name="telefono"
                      autoComplete="tel"
                      placeholder="+56 9 1234 5678"
                      className="field"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-mist/90">
                    Tamaño del equipo en terreno
                  </span>
                  <select name="tamanoEquipo" className="field" defaultValue={TEAM_SIZES[1]}>
                    {TEAM_SIZES.map((size) => (
                      <option key={size} value={size} className="bg-navy text-mist">
                        {size}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-mist/90">
                    ¿Qué te quita el sueño hoy? <span className="font-normal text-ink/60">(opcional)</span>
                  </span>
                  <textarea
                    name="mensaje"
                    rows={3}
                    placeholder="Ej.: los pedidos llegan por WhatsApp y se pierden…"
                    className="field resize-none"
                  />
                </label>

                {status === "error" && (
                  <p className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-xs font-semibold text-rose">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-sm font-black text-white shadow-xl shadow-primary/25 transition-all hover:bg-primary-soft hover:shadow-primary/45 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {status === "sending" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Enviando solicitud…
                    </>
                  ) : (
                    <>
                      Agenda mi demo
                      <Send
                        size={15}
                        className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5"
                      />
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] leading-relaxed text-ink/60">
                  Al enviar aceptas nuestra política de privacidad. Nunca
                  compartimos tus datos.
                </p>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
