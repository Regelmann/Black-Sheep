/**
 * LANDING — reconstruida sobre el patrón de 2026.
 *
 * 🔴 EL PROBLEMA: eran 26 SECCIONES DE CONTENIDO.
 * Linear, Vercel y Stripe —las tres canónicas— tienen seis. Con 26 el
 * visitante no llega al precio, y el footer queda tan abajo que
 * literalmente no se ve.
 *
 * EL PATRÓN, de las landings que convierten:
 *   1 · Hero — el PRODUCTO en el frame, no una promesa
 *   2 · Prueba social — inmediata, corta
 *   3 · Problema — el costo de no tenerlo
 *   4 · Producto — cómo funciona, mostrado
 *   5 · Territorio — la pieza de identidad
 *   6 · Precio — transparente, sin "contactar ventas"
 *   7 · Cierre — FAQ + formulario
 *
 * Todo lo demás se sacó del render. Los componentes siguen en el repo
 * —no se borra trabajo— pero no compiten por la atención.
 *
 * Lo que se cortó y por qué:
 *   Comparison, AntesDespues, Canales  → decían lo mismo tres veces
 *   Stats, ROICalculator, Integrations → tres bloques de números seguidos
 *   ProductShowcase + BentoFeatures    → redundantes con ExplodedApp
 *   ActivityTicker, LiveToasts, Beam   → ruido, no argumento
 *   FlowMarquee, FlowSteps, VendorDay  → el mismo relato del día
 */
import HomeShell from "@/components/HomeShell";
import Navbar from "@/components/Navbar";
import DynamicBackground from "@/components/DynamicBackground";
import ScrollProgress from "@/components/ScrollProgress";
import Hero from "@/components/Hero";
import TrustBar from "@/components/TrustBar";
import ProblemCost from "@/components/ProblemCost";
import ExplodedApp from "@/components/ExplodedApp";
import CatalogoProtagonista from "@/components/CatalogoProtagonista";
import Costanera3D from "@/components/Costanera3D";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import CTAForm from "@/components/CTAForm";
import Footer from "@/components/Footer";
import WhatsAppFloat from "@/components/WhatsAppFloat";

export default function Home() {
  return (
    <HomeShell>
      <div className="relative min-h-screen overflow-x-clip">
        <DynamicBackground />
        <ScrollProgress />
        <Navbar />

        <main className="relative">
          {/* 1 · El producto en el frame */}
          <Hero />

          {/* 2 · Prueba social, corta */}
          <TrustBar />

          {/* 3 · El costo de no tenerlo */}
          <div id="terreno" className="scroll-mt-24">
            <ProblemCost />
          </div>

          {/* 4 · Cómo funciona, mostrado */}
          <div id="producto" className="scroll-mt-24">
            <ExplodedApp />
            <CatalogoProtagonista />
          </div>

          {/* 5 · La identidad: el territorio real */}
          <div id="gerencia" className="scroll-mt-24">
            <Costanera3D />
          </div>

          {/* 6 · Precio transparente */}
          <Pricing />

          {/* 7 · Cierre */}
          <FAQ />
          <CTAForm />
        </main>

        <Footer />
        <WhatsAppFloat />
      </div>
    </HomeShell>
  );
}
