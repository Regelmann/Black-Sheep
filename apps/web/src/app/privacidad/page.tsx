import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Black Sheep Field",
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-mist">
      <Link href="/" className="text-sm font-bold text-primary">
        ← Volver
      </Link>
      <h1 className="mt-6 font-display text-4xl font-black tracking-tight">
        Política de Privacidad
      </h1>
      <p className="mt-2 text-sm text-ink">Última actualización: 30 de agosto de 2026</p>
      <div className="prose-legal mt-10 space-y-6 text-[15px] leading-relaxed text-ink">
        <p>
          Black Sheep Field (&quot;Black Sheep&quot;, &quot;nosotros&quot;) opera la plataforma web y
          móvil disponible en black-sheep.cl y dominios asociados. Esta política describe
          cómo tratamos datos personales conforme a la Ley N° 19.628 y normativa aplicable
          en Chile.
        </p>
        <h2 className="font-display text-xl font-bold text-white">1. Responsable</h2>
        <p>
          El responsable del tratamiento es Black Sheep. Contacto:{" "}
          <a className="text-primary" href="mailto:hola@black-sheep.cl">
            hola@black-sheep.cl
          </a>{" "}
          · WhatsApp{" "}
          <a className="text-primary" href="https://wa.me/56932188569">
            +56 9 3218 8569
          </a>
          .
        </p>
        <h2 className="font-display text-xl font-bold text-white">2. Datos que recolectamos</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Identificación y contacto: nombre, empresa, correo, teléfono.</li>
          <li>Datos de uso de la plataforma (logs técnicos, dispositivo, IP).</li>
          <li>
            Datos comerciales que el cliente carga (clientes, pedidos, precios) bajo su
            control y cuenta.
          </li>
        </ul>
        <h2 className="font-display text-xl font-bold text-white">3. Finalidad</h2>
        <p>
          Prestar el servicio, responder solicitudes de demo, mejorar el producto, cumplir
          obligaciones legales y comunicar novedades relacionadas al servicio (con opción de
          baja).
        </p>
        <h2 className="font-display text-xl font-bold text-white">4. Encargados y terceros</h2>
        <p>
          Usamos proveedores de infraestructura (hosting, autenticación, bases de datos) bajo
          contratos de encargo. No vendemos datos personales.
        </p>
        <h2 className="font-display text-xl font-bold text-white">5. Derechos</h2>
        <p>
          Podés solicitar acceso, rectificación, cancelación y oposición escribiendo a{" "}
          <a className="text-primary" href="mailto:hola@black-sheep.cl">
            hola@black-sheep.cl
          </a>
          . Responderemos en plazos razonables según la ley.
        </p>
        <h2 className="font-display text-xl font-bold text-white">6. Conservación y seguridad</h2>
        <p>
          Conservamos los datos mientras exista la relación comercial o una obligación legal.
          Aplicamos medidas técnicas y organizativas razonables de seguridad.
        </p>
      </div>
    </main>
  );
}
