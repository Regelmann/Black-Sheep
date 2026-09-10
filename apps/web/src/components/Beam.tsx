/** Divisor ornamental con un pulso de luz viajero entre secciones. */
export default function Beam() {
  return (
    <div aria-hidden className="relative mx-auto h-px w-full max-w-5xl overflow-hidden">
      <div className="hairline absolute inset-0" />
      <span className="animate-beam absolute top-0 block h-px w-36 bg-gradient-to-r from-transparent via-primary-soft to-transparent" />
    </div>
  );
}
