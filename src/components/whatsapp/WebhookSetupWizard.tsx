import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Copy, 
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Settings,
  Globe,
  Shield,
  Webhook
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WebhookSetupWizardProps {
  webhookUrl: string;
  verifyToken: string;
  accountName: string;
  onComplete: () => void;
  onBack?: () => void;
}

export const WebhookSetupWizard = ({
  webhookUrl,
  verifyToken,
  accountName,
  onComplete,
  onBack
}: WebhookSetupWizardProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const { toast } = useToast();

  const totalSteps = 2;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado al portapapeles.`,
    });
  };

  const markStepComplete = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
    }
  };

  const handleNext = () => {
    markStepComplete(currentStep);
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else if (onBack) {
      onBack();
    }
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="text-center pb-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Badge variant="secondary" className="text-xs">
            Paso {currentStep} de {totalSteps}
          </Badge>
        </div>
        <CardTitle className="font-display text-xl">
          Configuración de {accountName}
        </CardTitle>
        <CardDescription>
          Completa estos pasos para activar la recepción de mensajes
        </CardDescription>

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  completedSteps.includes(step)
                    ? "bg-primary text-primary-foreground"
                    : currentStep === step
                    ? "bg-primary/20 text-primary border-2 border-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {completedSteps.includes(step) ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  step
                )}
              </div>
              {step < totalSteps && (
                <div
                  className={`w-12 h-1 mx-1 rounded ${
                    completedSteps.includes(step) ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <Globe className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <h3 className="font-semibold">Paso 1: Configurar Webhook URL</h3>
                  <p className="text-sm text-muted-foreground">
                    Ingresa esta URL en el panel de desarrolladores de Meta
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Callback URL</label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="bg-background font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <ol className="space-y-3 text-sm">
                  <li className="flex gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">1</span>
                    <span>Ve a <strong>Meta for Developers</strong> → Tu App → WhatsApp → Configuración</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">2</span>
                    <span>En la sección <strong>Webhook</strong>, haz clic en <strong>Editar</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">3</span>
                    <span>Pega la <strong>Callback URL</strong> copiada arriba</span>
                  </li>
                </ol>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open("https://developers.facebook.com/apps/", "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir Meta for Developers
              </Button>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <Shield className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <h3 className="font-semibold">Paso 2: Verificar Token y Suscripciones</h3>
                  <p className="text-sm text-muted-foreground">
                    Completa la verificación y activa las suscripciones necesarias
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Token de verificación</label>
                  <div className="flex gap-2">
                    <Input value={verifyToken} readOnly className="bg-background font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(verifyToken, "Token de verificación")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <ol className="space-y-3 text-sm">
                  <li className="flex gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">1</span>
                    <span>Pega el <strong>Token de verificación</strong> en el campo correspondiente</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">2</span>
                    <span>Haz clic en <strong>Verificar y guardar</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">3</span>
                    <span>En <strong>Campos de webhook</strong>, suscríbete a:</span>
                  </li>
                </ol>

                <div className="flex flex-wrap gap-2 ml-7">
                  <Badge variant="secondary" className="font-mono text-xs">messages</Badge>
                  <Badge variant="secondary" className="font-mono text-xs">message_status</Badge>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-4">
                  <div className="flex items-start gap-2">
                    <Webhook className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Una vez verificado, tu cuenta estará lista para recibir mensajes de WhatsApp en tiempo real.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1 && !onBack}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {currentStep === 1 ? "Volver" : "Anterior"}
          </Button>

          <Button onClick={handleNext} className="bg-gradient-hero hover:opacity-90">
            {currentStep === totalSteps ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Finalizar
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
