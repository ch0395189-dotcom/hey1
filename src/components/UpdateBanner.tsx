import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Banner que aparece cuando el Service Worker detecta una nueva versión.
 * El usuario decide cuándo recargar (no pierde lo que está escribiendo).
 */
export function UpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<{ worker: ServiceWorker }>;
      if (customEvent.detail?.worker) {
        setWaitingWorker(customEvent.detail.worker);
        setVisible(true);
      }
    };

    window.addEventListener("sw-update-available", handleUpdateAvailable);
    return () => {
      window.removeEventListener("sw-update-available", handleUpdateAvailable);
    };
  }, []);

  const handleReload = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-primary-foreground shadow-lg animate-in slide-in-from-top duration-300">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4 flex-shrink-0" />
          <span>Hay una nueva versión disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleReload}
            className="h-8"
          >
            Actualizar ahora
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setVisible(false)}
            className="h-8 w-8 p-0 text-primary-foreground hover:bg-primary-foreground/10"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}