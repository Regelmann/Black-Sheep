"use client";

import { useState, type FormEvent } from "react";

const WA = "56932188569";

export default function CTAForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [err, setErr] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErr("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      nombre: String(fd.get("nombre") || ""),
      empresa: String(fd.get("empresa") || ""),
      email: String(fd.get("email") || ""),
      telefono: String(fd.get("telefono") || ""),
      tamanoEquipo: String(fd.get("tamanoEquipo") || ""),
      mensaje: String(fd.get("mensaje") || ""),
    };
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error al enviar");
      setStatus("ok");
      e.currentTarget.reset();
    } catch (ex) {
      setStatus("err");
      setErr(ex instanceof Error ? ex.message : "No se pudo enviar");
    }
  }

  return (
    <section id="demo" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase">
            Empieza hoy
          </p>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Ordena tu terreno
            <br />
            en 2 semanas
          </h2>
          <p className="mt-4 max-w-md text-ink">
            Demo de 30 minutos. Muestranos tu operación y te mostramos ruta, precios y
            alertas con tus datos reales.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              ["Migración de Excel", "Clientes, listas y acuerdos — semana 1."],
              ["Respuesta en 24 h hábiles", "Correo o WhatsApp, como te acomode."],
              ["Sin tarjeta ni compromiso", "La demo es gratuita."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="font-bold text-white">{t}</p>
                  <p className="text-sm text-ink">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          <a
            href={`https://wa.me/${WA}?text=${encodeURIComponent("Hola, quiero una demo de Black Sheep Field")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            O escríbenos por WhatsApp →
          </a>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-line bg-card/80 p-6 shadow-xl backdrop-blur sm:p-8"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold text-white">
                Nombre <span className="text-primary">*</span>
              </span>
              <input
                name="nombre"
                required
                autoComplete="name"
                className="w-full rounded-xl border border-line bg-black px-4 py-3 text-white outline-none focus:border-primary"
                placeholder="Camila Rojas"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold text-white">Empresa</span>
              <input
                name="empresa"
                autoComplete="organization"
                className="w-full rounded-xl border border-line bg-black px-4 py-3 text-white outline-none focus:border-primary"
                placeholder="Distribuidora SpA"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold text-white">
                Correo <span className="text-primary">*</span>
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-line bg-black px-4 py-3 text-white outline-none focus:border-primary"
                placeholder="camila@empresa.cl"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-semibold text-white">
                Teléfono / WhatsApp
              </span>
              <input
                name="telefono"
                autoComplete="tel"
                className="w-full rounded-xl border border-line bg-black px-4 py-3 text-white outline-none focus:border-primary"
                placeholder="+56 9 3218 8569"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block font-semibold text-white">
              Tamaño del equipo en terreno
            </span>
            <select
              name="tamanoEquipo"
              className="w-full rounded-xl border border-line bg-black px-4 py-3 text-white outline-none focus:border-primary"
              defaultValue="2-5"
            >
              <option value="1">1 vendedor</option>
              <option value="2-5">2–5 vendedores</option>
              <option value="6-15">6–15 vendedores</option>
              <option value="16+">16 o más</option>
            </select>
          </label>
          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block font-semibold text-white">
              ¿Qué te quita el sueño?{" "}
              <span className="font-normal text-ink">(opcional)</span>
            </span>
            <textarea
              name="mensaje"
              rows={3}
              className="w-full resize-y rounded-xl border border-line bg-black px-4 py-3 text-white outline-none focus:border-primary"
              placeholder="Ej.: los pedidos llegan por WhatsApp y se pierden…"
            />
          </label>

          {status === "ok" && (
            <p className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
              Listo. Te contactamos en menos de 24 h hábiles.
            </p>
          )}
          {status === "err" && (
            <p className="mt-4 rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-6 w-full rounded-xl bg-primary py-3.5 text-sm font-black text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {status === "loading" ? "Enviando…" : "Agendar mi demo"}
          </button>
          <p className="mt-3 text-center text-[11px] text-ink">
            Al enviar aceptás la{" "}
            <a href="/privacidad" className="text-primary underline">
              política de privacidad
            </a>
            . Nunca vendemos tus datos.
          </p>
        </form>
      </div>
    </section>
  );
}
