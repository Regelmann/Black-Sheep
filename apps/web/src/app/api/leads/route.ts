import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo de la solicitud inválido." },
      { status: 400 },
    );
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const nombre = clean(payload.nombre, 120);
  const empresa = clean(payload.empresa, 160);
  const email = clean(payload.email, 180).toLowerCase();
  const telefono = clean(payload.telefono, 40);
  const tamanoEquipo = clean(payload.tamanoEquipo, 40);
  const mensaje = clean(payload.mensaje, 2000);

  if (nombre.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Cuéntanos tu nombre para poder contactarte." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "El correo no parece válido." },
      { status: 400 },
    );
  }

  // Regla del proyecto: vacío ≠ roto. Si no hay base configurada no
  // podemos guardar el lead, y decirle "ok" al usuario sería una mentira.
  if (!process.env.DATABASE_URL) {
    console.error("[lead] sin DATABASE_URL — no se guardó el lead");
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar tu solicitud. Intentá de nuevo." },
      { status: 503 },
    );
  }

  try {
    const [{ db }, { leads }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ]);
    // `db` puede ser null si el módulo no logró conectar (p. ej. Pool
    // falló al iniciar). Con la confesión temprana de arriba no debería
    // pasar, pero la guarda evita un "Cannot read properties of null".
    if (!db) throw new Error("db no inicializada");

    await db.insert(leads).values({
      nombre,
      empresa: empresa || null,
      email,
      telefono: telefono || null,
      tamanoEquipo: tamanoEquipo || null,
      mensaje: mensaje || null,
    });
  } catch (err) {
    console.error("[lead] persist failed", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar tu solicitud. Intentá de nuevo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
