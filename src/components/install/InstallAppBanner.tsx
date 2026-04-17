import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useInstallPrompt,
  isInstallBannerDismissed,
  dismissInstallBanner,
} from "@/hooks/useInstallPrompt";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Floating banner shown on mobile devices that aren't installed yet,
 * inviting the user to install the PWA. Auto-hides for 7 days when dismissed.
 */
export const InstallAppBanner = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone) return;
    if (!isMobile) return;
    if (isInstallBannerDismissed()) return;
    // Show on Android (canInstall) OR on iOS (manual instructions)
    if (canInstall || isIOS) {
      // small delay so it doesn't pop immediately on first paint
      const t = setTimeout(() => setHidden(false), 1500);
      return () => clearTimeout(t);
    }
  }, [isMobile, isStandalone, canInstall, isIOS]);

  if (hidden || isStandalone) return null;

  const handleInstall = async () => {
    if (canInstall) {
      const ok = await promptInstall();
      if (ok) setHidden(true);
    } else {
      navigate("/install");
    }
  };

  const handleDismiss = () => {
    dismissInstallBanner();
    setHidden(true);
  };

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 md:hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="dialog"
      aria-label="Instalar Hey Hey"
    >
      <div className="bg-card border border-border shadow-2xl rounded-2xl p-3 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">Instala Hey Hey</p>
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">
            Acceso rápido y notificaciones en tu pantalla de inicio
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleInstall}
          className="flex-shrink-0 h-9 px-3"
        >
          <Download className="w-4 h-4 mr-1" />
          {isIOS ? "Cómo" : "Instalar"}
        </Button>
        <button
          onClick={handleDismiss}
          aria-label="Descartar"
          className="text-muted-foreground hover:text-foreground p-1 -mr-1 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
