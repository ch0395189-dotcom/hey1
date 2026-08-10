import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Check, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import apkAsset from "@/assets/hey-hey-apk.asset.json";

const APK_VERSION = "1.2";
const APK_SIZE_MB = (apkAsset.size / (1024 * 1024)).toFixed(1);

const Descargar = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Smartphone className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Descargar Hey Hey para Android</CardTitle>
          <CardDescription>
            Versión {APK_VERSION} · APK · {APK_SIZE_MB} MB
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button asChild size="lg" className="w-full">
            <a href={apkAsset.url} download="hey-hey-1.2.apk">
              <Download className="mr-2 h-5 w-5" />
              Descargar APK
            </a>
          </Button>

          <div className="space-y-3">
            <h4 className="font-medium text-sm">Cómo instalar:</h4>
            {[
              "Toca “Descargar APK” desde tu celular Android",
              "Abre el archivo descargado (Descargas o la notificación)",
              "Permite “Instalar apps desconocidas” si el sistema lo pide",
              "Confirma “Instalar” y abre Hey Hey",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-primary text-sm">
                  {i + 1}
                </div>
                <p className="text-sm">{step}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Descarga oficial de Hey Hey. Al no venir de Play Store, Android puede mostrar un aviso de
              origen desconocido: es normal, solo acepta para continuar.
            </p>
          </div>

          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />Notificaciones push con la app cerrada</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />Bandeja unificada de WhatsApp y más</li>
          </ul>

          <div className="grid gap-2">
            <Button variant="outline" onClick={() => navigate("/install")} className="w-full">
              Prefiero instalarla como app web (iPhone/Android)
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
              Volver al inicio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Descargar;
