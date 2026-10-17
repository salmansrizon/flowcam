import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { BigWord } from "@/components/BigWord";
import { HowItWorks } from "@/components/HowItWorks";
import { FeatureDeepDives } from "@/components/FeatureDeepDives";
import { FlowDiagram } from "@/components/FlowDiagram";
import { FeatureGrid } from "@/components/FeatureGrid";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { ClosingCta } from "@/components/ClosingCta";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <BigWord />
        <HowItWorks />
        <FeatureDeepDives />
        <FlowDiagram />
        <FeatureGrid />
        <Pricing />
        <FAQ />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
