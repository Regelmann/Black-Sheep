"use client";

/**
 * DASHBOARD DE GERENCIA — black-sheep.cl/dashboard
 *
 * ESTO ES LO QUE FALTABA.
 *
 * `/gerencia` dentro de la app es la vista de un vendedor en un teléfono.
 * Esto es otra cosa: la pantalla que el gerente mira en 30 pulgadas y ve
 * el negocio COMPLETO — ejecutivos de terreno, KAM, Televenta, Corporativo,
 * qué se le vende a cada uno — y desde donde corrige.
 *
 * Se pidió desde la primera conversación ("el Control Center no funciona
 * como el dashboard"). Yo pregunté dos veces si debía replicar la vista
 * móvil o ser propia, no obtuve respuesta, y nunca lo construí. El
 * `dashboard.html` que quedó en el repo eran 16 líneas que redirigían a
 * la app. Eso no era el dashboard.
 *
 * Layout de escritorio de verdad: grilla ancha, tablas densas, todo en
 * pantalla sin scroll horizontal. No es la app estirada.
 */
import { useEffect, useState, useMemo } from "react";
import { supabase, supabaseConfigurado } from "@/lib/supabase";

type Fila = Record<string, unknown>;

const clp = (n: unknown) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Canales que NO son terreno: se miran aparte porque no tienen ruta ni meta por zona. */
const CANALES_INTERNOS = ["KAM", "TELEVENTA", "CORPORATIVO", "OTROS", "NO_ASIGNADO"];

export default function Dashboard() {
  const [gerencia, setGerencia] = useState<Fila[]>([]);
  const [clientes, setClientes] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setCargando(false);
      return;
    }
    (async () => {
      const [g, c] = await Promise.all([
        supabase.from("gerencia").select("*"),
        supabase
          .from("gerencia_clientes")
          .select("nombre_cliente,comuna,zona,canal,venta_mtd,ejecutivo")
          .order("venta_mtd", { ascending: false })
          .limit(1000),
      ]);
      if (g.error) setError(g.error.message);
      setGerencia((g.data as Fila[]) || []);
      setClientes((c.data as Fila[]) || []);
      setCargando(false);
    })();
  }, []);

  const resumen = useMemo(() => {
    const terreno = gerencia.filter(
      (r) => !CANALES_INTERNOS.includes(String(r.nombre || r.ejecutivo || "").toUpperCase())
    );
    const canales = gerencia.filter((r) =>
      CANALES_INTERNOS.includes(String(r.nombre || r.ejecutivo || "").toUpperCase())
    );
    const suma = (rs: Fila[], k: string) =>
      rs.reduce((a, r) => a + (Number(r[k]) || 0), 0);

    const ventaTerreno = suma(terreno, "venta_mtd");
    const metaTerreno = suma(terreno, "meta_mensual");
    const ventaCanales = suma(canales, "venta_mtd");

    return {
      terreno,
      canales,
      ventaTerreno,
      metaTerreno,
      ventaCanales,
      ventaTotal: ventaTerreno + ventaCanales,
      brechaTerreno: Math.max(0, metaTerreno - ventaTerreno),
    };
  }, [gerencia]);

  if (cargando) {
    return (
      <main className="min-h-screen bg-[#0c0a09] p-10 text-white">
        <p className="text-ink">Cargando el negocio…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0c0a09] px-8 py-8 text-white">
      <header className="mb-8 flex items-end justify-between border-b border-white/10 pb-5">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Black Sheep · Dashboard
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
            El negocio completo
          </h1>
        </div>
        <a
          href="https://app.black-sheep.cl/"
          className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
        >
          Ir a la app de terreno →
        </a>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-rose/40 bg-rose/10 p-4 text-sm text-rose">
          {error}
        </div>
      )}

      {/* ── Fila 1 · Los cuatro números que importan ─────────────── */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tarjeta titulo="Venta total compañía" valor={clp(resumen.ventaTotal)} destacado />
        <Tarjeta
          titulo="Terreno"
          valor={clp(resumen.ventaTerreno)}
          pie={`${pct(resumen.ventaTerreno, resumen.metaTerreno)}% de ${clp(resumen.metaTerreno)}`}
        />
        <Tarjeta
          titulo="Otros canales"
          valor={clp(resumen.ventaCanales)}
          pie="KAM · Televenta · Corporativo"
        />
        <Tarjeta
          titulo="Brecha de terreno"
          valor={clp(resumen.brechaTerreno)}
          pie={resumen.brechaTerreno > 0 ? "falta para la meta" : "meta cumplida"}
          alerta={resumen.brechaTerreno > 0}
        />
      </section>

      {/* ── Fila 2 · Ejecutivos y canales, lado a lado ───────────── */}
      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <Panel titulo="Ejecutivos de terreno" nota="Con meta asignada">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-ink">
                <th className="pb-2">Ejecutivo</th>
                <th className="pb-2 text-right">Venta</th>
                <th className="pb-2 text-right">Meta</th>
                <th className="pb-2 text-right">Avance</th>
                <th className="pb-2 text-right">Brecha</th>
              </tr>
            </thead>
            <tbody>
              {resumen.terreno.map((r, i) => {
                const v = Number(r.venta_mtd) || 0;
                const m = Number(r.meta_mensual) || 0;
                const p = pct(v, m);
                return (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2.5 font-semibold">{String(r.nombre || r.ejecutivo)}</td>
                    <td className="py-2.5 text-right tabular-nums">{clp(v)}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">{clp(m)}</td>
                    <td
                      className={
                        "py-2.5 text-right font-bold tabular-nums " +
                        (p >= 100 ? "text-mint" : p >= 70 ? "text-amber" : "text-rose")
                      }
                    >
                      {p}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-ink">
                      {m > v ? clp(m - v) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel titulo="Otros canales" nota="Sin meta por zona">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-ink">
                <th className="pb-2">Canal</th>
                <th className="pb-2 text-right">Venta del mes</th>
                <th className="pb-2 text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {resumen.canales.map((r, i) => {
                const v = Number(r.venta_mtd) || 0;
                return (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2.5 font-semibold">{String(r.nombre || r.ejecutivo)}</td>
                    <td className="py-2.5 text-right tabular-nums">{clp(v)}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">
                      {pct(v, resumen.ventaTotal)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* ── Fila 3 · A quién se le vende ─────────────────────────── */}
      <Panel
        titulo="Clientes por venta del mes"
        nota={`${clientes.length} clientes · todos los canales`}
      >
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#141110]">
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-ink">
                <th className="py-2">Cliente</th>
                <th className="py-2">Comuna</th>
                <th className="py-2">Canal / Zona</th>
                <th className="py-2">Ejecutivo</th>
                <th className="py-2 text-right">Venta del mes</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2 font-medium">{String(c.nombre_cliente || "—")}</td>
                  <td className="py-2 text-ink">{String(c.comuna || "—")}</td>
                  <td className="py-2 text-ink">{String(c.canal || c.zona || "—")}</td>
                  <td className="py-2 text-ink">{String(c.ejecutivo || "sin asignar")}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {clp(c.venta_mtd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Acciones de corrección ───────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#141110] p-6">
        <h2 className="font-display text-lg font-bold">Corregir</h2>
        <p className="mt-1 text-sm text-ink">
          Maestra, precios, metas, focos y reasignación de prospectos.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {[
            ["Clientes y zonas", "clientes"],
            ["Lista de precios", "precios"],
            ["Metas del mes", "metas"],
            ["Productos foco", "focos"],
            ["Prospectos", "prospectos"],
          ].map(([label, tab]) => (
            <a
              key={tab}
              href={`https://app.black-sheep.cl/admin?tab=${tab}`}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-[#0c0a09] transition-transform hover:scale-[1.02]"
            >
              {label}
            </a>
          ))}
        </div>
      </section>

      {!supabaseConfigurado && (
        <p className="mt-8 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
          Sin credenciales de Supabase el dashboard no puede leer datos.
          Configurá <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en Vercel.
        </p>
      )}
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
  pie,
  destacado,
  alerta,
}: {
  titulo: string;
  valor: string;
  pie?: string;
  destacado?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-5 " +
        (destacado
          ? "border-primary/40 bg-primary/[0.07]"
          : "border-white/10 bg-[#141110]")
      }
    >
      <p className="text-xs font-bold uppercase tracking-wider text-ink">{titulo}</p>
      <p
        className={
          "mt-2 font-display text-3xl font-bold tabular-nums " +
          (alerta ? "text-rose" : destacado ? "text-primary" : "text-white")
        }
      >
        {valor}
      </p>
      {pie && <p className="mt-1 text-xs text-ink">{pie}</p>}
    </div>
  );
}

function Panel({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#141110] p-6">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-bold">{titulo}</h2>
        {nota && <span className="text-xs text-ink">{nota}</span>}
      </header>
      {children}
    </section>
  );
}
