import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  MessageCircle, 
  Loader2,
  Copy,
  RefreshCw,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WebhookSetupWizard } from "./WebhookSetupWizard";

interface ManualWhatsAppSetupProps {
  onAccountConnected?: () => void;
}

export const ManualWhatsAppSetup = ({ onAccountConnected }: ManualWhatsAppSetupProps) => {
  const [saving, setSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [savedAccountData, setSavedAccountData] = useState<{
    name: string;
    webhookUrl: string;
    verifyToken: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    phoneNumberId: '',
    businessAccountId: '',
    apiVersion: 'v21.0',
    accessToken: '',
  });
  const [webhookToken, setWebhookToken] = useState(() => 
    `verify_${Math.random().toString(36).substring(2, 15)}`
  );
  const { toast } = useToast();

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook-v2`;

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const regenerateWebhookToken = () => {
    setWebhookToken(`verify_${Math.random().toString(36).substring(2, 15)}`);
    toast({
      title: "Token regenerado",
      description: "Se ha generado un nuevo token de verificación.",
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado al portapapeles.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.displayName || !formData.phoneNumberId || !formData.businessAccountId || !formData.accessToken) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos obligatorios.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      // Insert the WhatsApp account directly
      const { data, error } = await supabase
        .from('whatsapp_accounts')
        .insert({
          user_id: user.id,
          phone_number: formData.displayName, // Using display name as phone for manual setup
          phone_number_id: formData.phoneNumberId,
          business_account_id: formData.businessAccountId,
          access_token: formData.accessToken,
          display_name: formData.displayName,
          webhook_verify_token: webhookToken,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "¡Cuenta guardada!",
        description: `Ahora configura el webhook para ${formData.displayName}.`,
      });

      // Store data for wizard and show it
      setSavedAccountData({
        name: formData.displayName,
        webhookUrl: webhookUrl,
        verifyToken: webhookToken,
      });
      setShowWizard(true);

      // Reset form
      setFormData({
        displayName: '',
        phoneNumberId: '',
        businessAccountId: '',
        apiVersion: 'v21.0',
        accessToken: '',
      });
      setWebhookToken(`verify_${Math.random().toString(36).substring(2, 15)}`);
    } catch (error: any) {
      console.error('Error saving WhatsApp account:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la cuenta de WhatsApp.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setSavedAccountData(null);
    onAccountConnected?.();
    toast({
      title: "¡Configuración completa!",
      description: "Tu cuenta de WhatsApp está lista para recibir mensajes.",
    });
  };

  const handleWizardBack = () => {
    setShowWizard(false);
    setSavedAccountData(null);
  };

  // Show wizard if account was just saved
  if (showWizard && savedAccountData) {
    return (
      <WebhookSetupWizard
        webhookUrl={savedAccountData.webhookUrl}
        verifyToken={savedAccountData.verifyToken}
        accountName={savedAccountData.name}
        onComplete={handleWizardComplete}
        onBack={handleWizardBack}
      />
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-8 h-8 text-primary-foreground" />
        </div>
        <CardTitle className="font-display">Conexión Manual - WABA API Oficial</CardTitle>
        <CardDescription>
          Ingresa manualmente las credenciales de tu WhatsApp Business API
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>API oficial</strong> - Servicio oficial con mayor garantía de estabilidad. 
            La API oficial de WhatsApp no admite grupos.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Nombre *</Label>
            <Input
              id="displayName"
              placeholder="Nombre de la cuenta"
              value={formData.displayName}
              onChange={(e) => handleInputChange('displayName', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumberId">ID del número de teléfono *</Label>
            <Input
              id="phoneNumberId"
              placeholder="Ej: 123456789012345"
              value={formData.phoneNumberId}
              onChange={(e) => handleInputChange('phoneNumberId', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessAccountId">ID de la cuenta de WhatsApp Business *</Label>
            <Input
              id="businessAccountId"
              placeholder="Ej: 123456789012345"
              value={formData.businessAccountId}
              onChange={(e) => handleInputChange('businessAccountId', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiVersion">Versión</Label>
            <Input
              id="apiVersion"
              placeholder="v21.0"
              value={formData.apiVersion}
              onChange={(e) => handleInputChange('apiVersion', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessToken">Token de acceso *</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="Tu token de acceso permanente"
              value={formData.accessToken}
              onChange={(e) => handleInputChange('accessToken', e.target.value)}
              required
            />
          </div>

          {/* Read-only fields */}
          <div className="space-y-2">
            <Label>URL de callback</Label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="bg-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, 'URL de callback')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Token de Webhook</Label>
            <div className="flex gap-2">
              <Input
                value={webhookToken}
                readOnly
                className="bg-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={regenerateWebhookToken}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookToken, 'Token de Webhook')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
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
                'Guardar'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
