import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tratamiento de Datos — Black Sheep Field",
};

export default function DatosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-mist">
      <Link href="/" className="text-sm font-bold text-primary">
        ← Volver
      </Link>
      <h1 className="mt-6 font-display text-4xl font-black tracking-tight">
        Tratamiento de Datos
      </h1>
      <p className="mt-2 text-sm text-ink">Última actualización: 30 de agosto de 2026</p>
      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-ink">
        <p>
          Este documento complementa la Política de Privacidad y describe el tratamiento de
          datos personales y de negocio en el marco del servicio Black Sheep Field.
        </p>
        <h2 className="font-display text-xl font-bold text-white">1. Roles</h2>
        <p>
          El cliente es, en general, responsable de los datos de sus propios clientes
          finales y ejecutivos. Black Sheep actúa como encargado del tratamiento para
          prestar la plataforma.
        </p>
        <h2 className="font-display text-xl font-bold text-white">2. Categorías</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Usuarios de la app (identidad, credenciales, actividad).</li>
          <li>Cartera comercial (clientes, pedidos, precios, ubicaciones de visita).</li>
          <li>Registros técnicos de seguridad y soporte.</li>
        </ul>
        <h2 className="font-display text-xl font-bold text-white">3. Base y finalidad</h2>
        <p>
          Ejecución del contrato de servicio, interés legítimo en seguridad y mejora del
          producto, y cumplimiento legal cuando corresponda.
        </p>
        <h2 className="font-display text-xl font-bold text-white">4. Encargados subcontratados</h2>
        <p>
          Infraestructura cloud, autenticación y monitoreo pueden ser prestados por
          proveedores internacionales bajo cláusulas contractuales adecuadas.
        </p>
        <h2 className="font-display text-xl font-bold text-white">5. Ejercicio de derechos</h2>
        <p>
          Escribí a{" "}
          <a className="text-primary" href="mailto:hola@black-sheep.cl">
            hola@black-sheep.cl
          </a>{" "}
          o WhatsApp{" "}
          <a className="text-primary" href="https://wa.me/56932188569">
            +56 9 3218 8569
          </a>
          .
        </p>
      </div>
    </main>
  );
}
