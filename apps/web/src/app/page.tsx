import HomeShell from "@/components/HomeShell";
import Navbar from "@/components/Navbar";
import CursorGlow from "@/components/CursorGlow";
import ScrollProgress from "@/components/ScrollProgress";
import DynamicBackground from "@/components/DynamicBackground";
import Hero from "@/components/Hero";
import TrustBar from "@/components/TrustBar";
import ProblemCost from "@/components/ProblemCost";
import Comparison from "@/components/Comparison";
import ProductShowcase from "@/components/ProductShowcase";
import BentoFeatures from "@/components/BentoFeatures";
import Stats from "@/components/Stats";
import FlowSteps from "@/components/FlowSteps";
import VendorDay from "@/components/VendorDay";
import ROICalculator from "@/components/ROICalculator";
import Integrations from "@/components/Integrations";
import CaseStudy from "@/components/CaseStudy";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import CTAForm from "@/components/CTAForm";
import Footer from "@/components/Footer";
import FlowMarquee from "@/components/FlowMarquee";
import Beam from "@/components/Beam";
import LiveToasts from "@/components/LiveToasts";
import FloatingCTA from "@/components/FloatingCTA";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import ChapterRail from "@/components/ChapterRail";

function S({
  children,
  gsap = "fade-up",
  className = "",
  id,
}: {
  children: React.ReactNode;
  gsap?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div data-gsap={gsap} className={className} id={id}>
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <HomeShell>
      <div className="relative min-h-screen overflow-x-clip">
        <DynamicBackground />
        <ScrollProgress />
        <CursorGlow />
        <Navbar />
        <ChapterRail />

        <main className="relative">
          <div data-gsap-fade-out>
            <Hero />
          </div>

          {/* Capítulo TERRENO */}
          <div id="terreno" className="scroll-mt-24">
            <div className="px-6 pt-8">
              <div className="mx-auto flex max-w-6xl items-center gap-4">
                <span className="font-display text-xs font-black tracking-[0.25em] text-primary uppercase">
                  Terreno
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-primary/50 to-transparent" />
              </div>
            </div>
            <S gsap="fade">
              <TrustBar />
            </S>
            <S gsap="fade-up">
              <ProblemCost />
            </S>
            <S gsap="slide-left">
              <Comparison />
            </S>
            <FlowMarquee />
            <S gsap="scale" id="producto">
              <ProductShowcase />
            </S>
            <div data-gsap-stagger-children data-gsap-stagger="0.1">
              <BentoFeatures />
            </div>
            <S gsap="slide-right">
              <FlowSteps />
            </S>
            <S gsap="fade-up">
              <VendorDay />
            </S>
          </div>

          {/* Capítulo GERENCIA */}
          <div id="gerencia" className="scroll-mt-24">
            <div className="px-6 pt-16">
              <div className="mx-auto flex max-w-6xl items-center gap-4">
                <span className="font-display text-xs font-black tracking-[0.25em] text-primary uppercase">
                  Gerencia
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-primary/50 to-transparent" />
              </div>
            </div>
            <S gsap="fade-up">
              <Stats />
            </S>
            <Beam />
            <S gsap="scale">
              <ROICalculator />
            </S>
            <S gsap="fade-up">
              <Integrations />
            </S>
            <S gsap="slide-left">
              <CaseStudy />
            </S>
          </div>

          <FlowMarquee
            items={["Offline-first", "ERP Sync", "Fuga cero", "Hecho en Chile"]}
            reverse
          />

          <Beam />

          <div data-gsap-progress className="relative">
            <div
              data-gsap-progress-bar
              className="pointer-events-none absolute top-0 left-0 z-10 h-[2px] w-full origin-left scale-x-0 bg-primary"
            />
            <S gsap="fade-up">
              <Pricing />
            </S>
          </div>

          <S gsap="fade-up">
            <Testimonials />
          </S>
          <S gsap="fade-up">
            <FAQ />
          </S>
          <Beam />
          <S gsap="scale">
            <CTAForm />
          </S>
        </main>

        <Footer />
        <LiveToasts />
        <FloatingCTA />
        <WhatsAppFloat />
      </div>
    </HomeShell>
  );
}
