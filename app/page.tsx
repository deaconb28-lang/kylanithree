import Hero from "../components/landing/Hero";
import Marquee from "../components/landing/Marquee";
import ProcessSteps from "../components/landing/ProcessSteps";
import AdsComparison from "../components/landing/AdsComparison";
import TimeStepper from "../components/landing/TimeStepper";
import RevenueFindings from "../components/landing/RevenueFindings";
import Testimonials from "../components/landing/Testimonials";
import Pricing from "../components/landing/Pricing";
import Faq from "../components/landing/Faq";
import ClosingFooter from "../components/landing/ClosingFooter";

export default function Home() {
  return (
    <div id="how">
      <Hero />
      <Marquee />
      <ProcessSteps />
      <AdsComparison />
      <TimeStepper />
      <RevenueFindings />
      <Testimonials />
      <Pricing />
      <Faq />
      <ClosingFooter />
    </div>
  );
}
