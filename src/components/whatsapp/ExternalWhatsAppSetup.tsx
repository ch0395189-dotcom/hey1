import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  QrCode, 
  Loader2,
  Info,
  CheckCircle2,
  Copy,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExternalWhatsAppSetupProps {
  onAccountConnected?: () => void;
}

const WUZAPI_URL = 'https://bot.heyheychat.uk';

export const ExternalWhatsAppSetup = ({ onAccountConnected }: ExternalWhatsAppSetupProps) => {
  const [saving, setSaving] = useState(false);
  const [savedAccount, setSavedAccount] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    apiKey: '',
    instanceId: '',
  });
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.displayName || !formData.apiKey || !formData.instanceId) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      // Insert the external WhatsApp account
      const { data, error } = await supabase
        .from('whatsapp_accounts')
        .insert({
          user_id: user.id,
          phone_number: formData.instanceId,
          phone_number_id: formData.instanceId,
          business_account_id: 'wuzapi',
          access_token: formData.apiKey,
          display_name: formData.displayName,
          is_active: true,
          connection_type: 'external_qr',
          external_service_url: WUZAPI_URL,
          external_api_key: formData.apiKey,
          external_instance_id: formData.instanceId,
        })
        .select('id')
        .single();

      if (error) throw error;

      toast({
        title: "¡Cuenta configurada!",
        description: "Ahora configura el webhook en WuzAPI.",
      });

      setSavedAccount({ id: data.id, name: formData.displayName });

      setFormData({
        displayName: '',
        apiKey: '',
        instanceId: '',
      });
      
      onAccountConnected?.();
    } catch (error: any) {
      console.error('Error saving external WhatsApp account:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la cuenta.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = savedAccount 
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook-external?account_id=${savedAccount.id}`
    : '';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado al portapapeles.`,
    });
  };

  // Show webhook configuration after account is saved
  if (savedAccount) {
    return (
      <Card className="border-2 border-primary/20">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-display">¡Cuenta creada!</CardTitle>
          <CardDescription>
            Ahora configura el webhook en WuzAPI para recibir mensajes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription>
              <strong>Paso importante:</strong> Copia esta URL y configúrala como webhook en el panel de WuzAPI
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="font-medium">URL del Webhook</Label>
            <div className="flex gap-2">
              <Input 
                value={webhookUrl} 
                readOnly 
                className="bg-muted font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, "URL del Webhook")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta URL es única para tu cuenta "{savedAccount.name}"
            </p>
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Configuración en WuzAPI:</h4>
            <ol className="space-y-1 text-sm text-muted-foreground">
              <li>1. Ve al panel de WuzAPI: <a href={WUZAPI_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">{WUZAPI_URL}</a></li>
              <li>2. Haz clic en "AJUSTES" de tu conexión de WhatsApp</li>
              <li>3. Activa la opción <strong>"Activar Webhook"</strong></li>
              <li>4. Pega la URL de arriba en el campo "URL servidor WebHook"</li>
              <li>5. Guarda los cambios</li>
            </ol>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setSavedAccount(null)}
            >
              Conectar otra cuenta
            </Button>
            <Button
              className="flex-1 bg-gradient-hero hover:opacity-90"
              onClick={() => window.location.href = '/dashboard'}
            >
              Ir al Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center mx-auto mb-4">
          <QrCode className="w-8 h-8 text-primary-foreground" />
        </div>
        <CardTitle className="font-display">Conexión WuzAPI</CardTitle>
        <CardDescription>
          Conecta tu WhatsApp usando WuzAPI ({WUZAPI_URL})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6 bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Primero escanea el QR en WuzAPI</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(WUZAPI_URL, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Abrir WuzAPI
            </Button>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Nombre de la cuenta *</Label>
            <Input
              id="displayName"
              placeholder="Ej: Mi WhatsApp Business"
              value={formData.displayName}
              onChange={(e) => handleInputChange('displayName', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instanceId">Nombre de usuario en WuzAPI *</Label>
            <Input
              id="instanceId"
              placeholder="Ej: jefferson, admin, etc."
              value={formData.instanceId}
              onChange={(e) => handleInputChange('instanceId', e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Es el usuario que configuraste en WuzAPI (visible en el panel)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">Token de API *</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Token configurado en WuzAPI"
              value={formData.apiKey}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Es el token de autenticación configurado en WuzAPI
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-hero hover:opacity-90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Conectar WuzAPI'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t">
          <h4 className="font-medium mb-3">Pasos para conectar:</h4>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-bold text-primary">1.</span>
              Abre el panel de WuzAPI y escanea el código QR con tu WhatsApp
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">2.</span>
              Una vez conectado, copia el nombre de usuario y token
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">3.</span>
              Pega los datos aquí y guarda
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">4.</span>
              Configura el webhook en WuzAPI con la URL que te daremos
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
