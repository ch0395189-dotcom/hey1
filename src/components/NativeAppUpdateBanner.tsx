import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

/**
 * Aviso de nueva versión del APK (modo híbrido).
 *
 * El APK trae el código empaquetado, así que los cambios publicados en la web
 * no llegan solos. Este banner consulta `app-version.json` del sitio publicado
 * y, si hay un build más nuevo que el instalado, ofrece el enlace de descarga.
 */
const VERSION_URL = "https://www.heyhey.site/app-version.json";
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

type RemoteVersion = {
  versionCode?: number;
  versionName?: string;
  downloadUrl?: string;
  notes?: string;
  required?: boolean;
};

export function NativeAppUpdateBanner() {
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    const check = async () => {
      try {
        const info = await CapApp.getInfo();
        const installedCode = Number(info.build) || 0;
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as RemoteVersion;
        if (cancelled) return;
        if (
          typeof data?.versionCode === "number" &&
          data.versionCode > installedCode &&
          data.downloadUrl
        ) {
          setRemote(data);
          setDismissed(false);
        }
      } catch {
        // Sin conexión o JSON inválido: reintentamos en el próximo ciclo.
      }
    };

    void check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void check();
    });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void listener.then((l) => l.remove());
    };
  }, []);

  if (!remote || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-primary-foreground shadow-lg animate-in slide-in-from-top duration-300">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Download className="w-4 h-4 flex-shrink-0" />
          <span>
            Nueva versión de la app{" "}
            {remote.versionName ? `(${remote.versionName})` : ""} disponible
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={() => window.open(remote.downloadUrl!, "_blank")}
          >
            Descargar
          </Button>
          {!remote.required && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => setDismissed(true)}
              aria-label="Cerrar aviso de actualización"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}