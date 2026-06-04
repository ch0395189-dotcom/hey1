import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SAFE_TIKTOK_TEMPLATE = `Hola {{1}}, gracias por compartir tus datos en nuestro formulario de TikTok.

Soy del equipo de HeyHey. Te escribimos para continuar con la información que solicitaste.

¿Quieres que te enviemos más detalles por este medio?`;

interface WhatsAppTemplateCreatorProps {
  accountId: string;
  connectionType?: string | null;
}

export const WhatsAppTemplateCreator = ({ accountId, connectionType }: WhatsAppTemplateCreatorProps) => {
  const [creating, setCreating] = useState(false);
  const [templateName, setTemplateName] = useState("lead_tiktok_bienvenida_suave");
  const [sampleName, setSampleName] = useState("Carlos");
  const [body, setBody] = useState(SAFE_TIKTOK_TEMPLATE);
  const { toast } = useToast();

  const isOfficial = connectionType !== "external_qr" && connectionType !== "external";

  const createTemplate = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-create-template", {
        body: {
          whatsapp_account_id: accountId,
          name: templateName,
          category: "MARKETING",
          language: "es",
          body,
          sample_name: sampleName,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Plantilla enviada a revisión",
        description: `Meta recibió ${templateName}. Revisa el estado en WhatsApp Manager.`,
      });
    } catch (error: any) {
      toast({
        title: "No se pudo crear la plantilla",
        description: error?.message || "Intenta de nuevo con una cuenta sin restricciones.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          Crear plantilla de bienvenida TikTok
        </CardTitle>
        <CardDescription>
          Versión neutral para leads que dejaron sus datos voluntariamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOfficial && (
          <Alert>
            <AlertDescription>
              Esta opción requiere una cuenta oficial de WhatsApp Business API conectada por Meta.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`template-name-${accountId}`}>Nombre de plantilla</Label>
            <Input
              id={`template-name-${accountId}`}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              disabled={!isOfficial || creating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`sample-name-${accountId}`}>Ejemplo para {'{{1}}'}</Label>
            <Input
              id={`sample-name-${accountId}`}
              value={sampleName}
              onChange={(event) => setSampleName(event.target.value)}
              disabled={!isOfficial || creating}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`template-body-${accountId}`}>Texto</Label>
          <Textarea
            id={`template-body-${accountId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={7}
            disabled={!isOfficial || creating}
          />
          <p className="text-xs text-muted-foreground">
            Mantén {'{{1}}'} para insertar el nombre del lead. Evita promesas, urgencia o descuentos agresivos.
          </p>
        </div>

        <Button onClick={createTemplate} disabled={!isOfficial || creating} className="w-full md:w-auto">
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
          Enviar plantilla a revisión
        </Button>
      </CardContent>
    </Card>
  );
};