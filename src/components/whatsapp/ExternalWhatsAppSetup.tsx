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
  ExternalLink,
  Webhook
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExternalWhatsAppSetupProps {
  onAccountConnected?: () => void;
}

const WUZAPI_PANEL_URL = 'https://bot.heyheychat.uk';
const WUZAPI_API_URL = 'https://api.heyheychat.uk';

export const ExternalWhatsAppSetup = ({ onAccountConnected }: ExternalWhatsAppSetupProps) => {
  const [saving, setSaving] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const [savedAccount, setSavedAccount] = useState<{ id: string; name: string; instanceId: string } | null>(null);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    apiToken: '',
    instanceId: '',
  });
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const configureWebhookAutomatically = async (accountId: string, instanceId: string) => {
    setConfiguringWebhook(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('heyhey-setup-webhook', {
        body: { accountId, instanceId },
      });

      if (response.error) {
        console.error('Webhook setup error:', response.error);
        return false;
      }

      const result = response.data;
      console.log('Webhook setup result:', result);

      if (result.success) {
        setWebhookConfigured(true);
        toast({
          title: "¡Webhook configurado!",
          description: "Los mensajes entrantes llegarán automáticamente.",
        });
        return true;
      } else {
        console.log('Webhook not auto-configured:', result.message);
        return false;
      }
    } catch (error) {
      console.error('Error configuring webhook:', error);
      return false;
    } finally {
      setConfiguringWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.displayName || !formData.apiToken || !formData.instanceId) {
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

      // Enforce plan limit
      const [{ count: currentCount }, { data: limit }] = await Promise.all([
        supabase.from('whatsapp_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.rpc('get_whatsapp_account_limit', { _user_id: user.id }),
      ]);
      const maxAllowed = (limit as number) ?? 1;
      if ((currentCount ?? 0) >= maxAllowed) {
        toast({
          title: "Límite alcanzado",
          description: `Tu plan permite ${maxAllowed} cuenta(s) de WhatsApp. Mejora tu plan para conectar más.`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Build the full API URL with the instance ID
      const fullApiUrl = `${WUZAPI_API_URL}/v1/api/external/${formData.instanceId}`;

      // Insert the external WhatsApp account
      const { data, error } = await supabase
        .from('whatsapp_accounts')
        .insert({
          user_id: user.id,
          phone_number: formData.instanceId,
          phone_number_id: formData.instanceId,
          business_account_id: 'wuzapi',
          access_token: formData.apiToken,
          display_name: formData.displayName,
          is_active: true,
          connection_type: 'external_qr',
          external_service_url: fullApiUrl,
          external_api_key: formData.apiToken,
          external_instance_id: formData.instanceId,
        })
        .select('id')
        .single();

      if (error) throw error;

      toast({
        title: "¡Cuenta guardada!",
        description: "Configurando webhook automáticamente...",
      });

      setSavedAccount({ id: data.id, name: formData.displayName, instanceId: formData.instanceId });

      // Try to configure webhook automatically
      await configureWebhookAutomatically(data.id, formData.instanceId);

      setFormData({
        displayName: '',
        apiToken: '',
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
            {webhookConfigured 
              ? "El webhook se configuró automáticamente. ¡Ya puedes recibir mensajes!"
              : "Configura el webhook para recibir mensajes entrantes"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhookConfigured ? (
            <Alert className="bg-green-500/10 border-green-500/30">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                <strong>¡Webhook configurado!</strong> Los mensajes entrantes llegarán automáticamente a tu bandeja.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {configuringWebhook ? (
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  <AlertDescription>
                    Configurando webhook automáticamente...
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Alert className="bg-amber-500/10 border-amber-500/30">
                    <Info className="h-4 w-4 text-amber-500" />
                    <AlertDescription>
                      <strong>Configuración manual necesaria:</strong> Copia esta URL y configúrala en el panel de HeyHey
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
                    <h4 className="font-medium text-sm">Configuración en HeyHey:</h4>
                    <ol className="space-y-1 text-sm text-muted-foreground">
                      <li>1. Ve al panel: <a href={WUZAPI_PANEL_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">{WUZAPI_PANEL_URL}</a></li>
                      <li>2. Busca tu instancia y haz clic en "AJUSTES"</li>
                      <li>3. Activa <strong>"Activar Webhook"</strong></li>
                      <li>4. Pega la URL de arriba</li>
                      <li>5. Guarda los cambios</li>
                    </ol>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => configureWebhookAutomatically(savedAccount.id, savedAccount.instanceId)}
                    disabled={configuringWebhook}
                  >
                    <Webhook className="w-4 h-4 mr-2" />
                    Reintentar configuración automática
                  </Button>
                </>
              )}
            </>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setSavedAccount(null);
                setWebhookConfigured(false);
              }}
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
          Conecta tu WhatsApp usando la API de HeyHey
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6 bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Obtén los datos de API en el panel</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(WUZAPI_PANEL_URL, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Abrir Panel
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
            <Label htmlFor="instanceId">ID de Instancia (UUID) *</Label>
            <Input
              id="instanceId"
              placeholder="Ej: a3b7b66f-5b0c-4d61-b39f-5119fa4acedd"
              value={formData.instanceId}
              onChange={(e) => handleInputChange('instanceId', e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Lo encuentras en la URL de la API (después de /external/)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiToken">Token de API *</Label>
            <Input
              id="apiToken"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={formData.apiToken}
              onChange={(e) => handleInputChange('apiToken', e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              El token JWT que aparece en la configuración de API
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
                'Conectar API'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t">
          <h4 className="font-medium mb-3">Pasos para conectar:</h4>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-bold text-primary">1.</span>
              Abre el panel y ve a la pestaña "API"
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">2.</span>
              Copia la URL (el UUID es el ID de instancia) y el Token
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">3.</span>
              Pega los datos aquí y guarda
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">4.</span>
              Configura el webhook en "CANALES" → "AJUSTES"
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
