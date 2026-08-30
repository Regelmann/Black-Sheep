export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * 🔴 EL BUG QUE ESTO ARREGLA
 * Antes: `import { db } from "@/db"` a nivel de módulo. Y `db/index.ts`
 * hace `throw new Error("DATABASE_URL is required")` al importarse.
 *
 * Next.js recolecta los datos de página en tiempo de BUILD, así que el
 * deploy entero fallaba con "Failed to collect page data for /api/health"
 * cuando no había DATABASE_URL — que es justo el caso normal, porque los
 * leads funcionan sin base de datos.
 *
 * Una ruta de diagnóstico no puede impedir que el sitio se publique.
 *
 * Ahora la DB se importa DENTRO del handler y sólo si la variable existe,
 * igual que en `api/leads`.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    // Sin base configurada NO es un error: es el modo esperado.
    // Los leads quedan en los logs de Vercel.
    return Response.json({ ok: true, db: "no-configurada" });
  }
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch (err) {
    return Response.json(
      { ok: false, db: "error", detalle: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
