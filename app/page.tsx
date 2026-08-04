import Hero from "../components/landing/Hero";
import ProcessSteps from "../components/landing/ProcessSteps";
import AdsComparison from "../components/landing/AdsComparison";
import Demo from "../components/landing/Demo";
import RevenueFindings from "../components/landing/RevenueFindings";
import Testimonials from "../components/landing/Testimonials";
import Pricing from "../components/landing/Pricing";
import Faq from "../components/landing/Faq";
import ClosingFooter from "../components/landing/ClosingFooter";

export default function Home() {
  return (
    <div id="how">
      <Hero />
      <ProcessSteps />
      <AdsComparison />
      <Demo />
      <RevenueFindings />
      <Testimonials />
      <Pricing />
      <Faq />
      <ClosingFooter />
    </div>
  );
}
