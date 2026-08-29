import Navbar from "@/components/Navbar";
import CursorGlow from "@/components/CursorGlow";
import ScrollProgress from "@/components/ScrollProgress";
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

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Resplandores ambientales fijos */}
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/14 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-[38%] -left-72 h-[480px] w-[480px] rounded-full bg-sky/8 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-72 bottom-0 h-[520px] w-[520px] rounded-full bg-primary-soft/10 blur-[130px]"
      />

      <ScrollProgress />
      <CursorGlow />
      <Navbar />

      <main className="relative">
        <Hero />
        <TrustBar />
        <ProblemCost />
        <Comparison />
        <FlowMarquee />
        <ProductShowcase />
        <BentoFeatures />
        <Stats />
        <Beam />
        <FlowSteps />
        <VendorDay />
        <FlowMarquee
          items={["Offline-first", "ERP Sync", "Fuga cero", "Hecho en Chile"]}
          reverse
        />
        <ROICalculator />
        <Integrations />
        <CaseStudy />
        <Beam />
        <Pricing />
        <Testimonials />
        <FAQ />
        <Beam />
        <CTAForm />
      </main>

      <Footer />
      <LiveToasts />
      <FloatingCTA />
    </div>
  );
}
