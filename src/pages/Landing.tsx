import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import Pricing from "@/components/landing/Pricing";
import Footer from "@/components/landing/Footer";
import { WhatsAppFloatingButton } from "@/components/ui/WhatsAppFloatingButton";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { restoreSupabaseSessionFromNativeBackup } from "@/lib/nativeSupabaseSession";
import { Capacitor } from "@capacitor/core";

const Landing = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    (async () => {
      const session = await restoreSupabaseSessionFromNativeBackup("native landing auto-open");
      if (!cancelled && session?.user) {
        navigate("/dashboard", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <Features />
      <Pricing />
      <Footer />
      <WhatsAppFloatingButton phoneNumber="+573238261825" />
    </div>
  );
};

export default Landing;
