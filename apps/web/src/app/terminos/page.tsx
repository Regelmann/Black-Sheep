import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos de Servicio — Black Sheep Field",
};

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-mist">
      <Link href="/" className="text-sm font-bold text-primary">
        ← Volver
      </Link>
      <h1 className="mt-6 font-display text-4xl font-black tracking-tight">
        Términos de Servicio
      </h1>
      <p className="mt-2 text-sm text-ink">Última actualización: 30 de agosto de 2026</p>
      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-ink">
        <p>
          Al usar Black Sheep Field aceptás estos términos. Si contratás en nombre de una
          empresa, declarás tener facultad para obligarla.
        </p>
        <h2 className="font-display text-xl font-bold text-white">1. Servicio</h2>
        <p>
          Black Sheep Field es una plataforma SaaS de operación comercial en terreno
          (ruta, precios, pedidos, gerencia). Las funcionalidades pueden evolucionar; te
          avisaremos cambios materiales cuando corresponda.
        </p>
        <h2 className="font-display text-xl font-bold text-white">2. Cuentas y uso</h2>
        <p>
          Sos responsable de la confidencialidad de credenciales y del uso lícito de la
          plataforma. No está permitido intentar vulnerar seguridad, revender el acceso sin
          acuerdo, ni cargar contenido ilegal.
        </p>
        <h2 className="font-display text-xl font-bold text-white">3. Planes y pagos</h2>
        <p>
          Los precios se publican en UF o pesos referenciales. La facturación (mensual o
          anual) y los impuestos aplicables se detallan en la propuesta u orden de compra.
          El no pago puede suspender el acceso.
        </p>
        <h2 className="font-display text-xl font-bold text-white">4. Datos del cliente</h2>
        <p>
          Los datos de negocio que cargás son tuyos. Nos autorizás a procesarlos solo para
          prestar el servicio. El detalle del tratamiento está en la{" "}
          <Link href="/datos" className="text-primary">
            Política de Tratamiento de Datos
          </Link>
          .
        </p>
        <h2 className="font-display text-xl font-bold text-white">5. Limitación</h2>
        <p>
          El servicio se presta &quot;tal cual&quot;. En la medida permitida por la ley,
          nuestra responsabilidad se limita a los montos pagados en los últimos 12 meses por
          el servicio afectado.
        </p>
        <h2 className="font-display text-xl font-bold text-white">6. Contacto</h2>
        <p>
          <a className="text-primary" href="mailto:hola@black-sheep.cl">
            hola@black-sheep.cl
          </a>{" "}
          · WhatsApp{" "}
          <a className="text-primary" href="https://wa.me/56932188569">
            +56 9 3218 8569
          </a>
        </p>
      </div>
    </main>
  );
}
