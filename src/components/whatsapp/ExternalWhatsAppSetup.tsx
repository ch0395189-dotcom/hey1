import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  QrCode, 
  Loader2,
  ExternalLink,
  Info,
  CheckCircle2,
  Copy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ExternalWhatsAppSetupProps {
  onAccountConnected?: () => void;
}

const SERVICES = [
  { 
    id: 'wuzapi', 
    name: 'WuzAPI', 
    url: 'https://github.com/asternic/wuzapi',
    description: 'API REST open source para WhatsApp',
    baseUrl: '',
    isSelfHosted: true
  },
  { 
    id: 'z-api', 
    name: 'Z-API', 
    url: 'https://z-api.io',
    description: 'Popular en Latinoamérica, fácil de usar',
    baseUrl: 'https://api.z-api.io',
    isSelfHosted: false
  },
  { 
    id: 'waha', 
    name: 'WAHA', 
    url: 'https://waha.devlike.pro',
    description: 'Open source, tiene plan gratuito',
    baseUrl: 'https://api.waha.devlike.pro',
    isSelfHosted: false
  },
  { 
    id: 'custom', 
    name: 'Otro servicio', 
    url: '',
    description: 'Configura tu propio servicio',
    baseUrl: '',
    isSelfHosted: false
  },
];

export const ExternalWhatsAppSetup = ({ onAccountConnected }: ExternalWhatsAppSetupProps) => {
  const [saving, setSaving] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('');
  const [savedAccount, setSavedAccount] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    serviceUrl: '',
    apiKey: '',
    instanceId: '',
  });
  const { toast } = useToast();

  const handleServiceChange = (serviceId: string) => {
    setSelectedService(serviceId);
    const service = SERVICES.find(s => s.id === serviceId);
    if (service && service.baseUrl) {
      setFormData(prev => ({ ...prev, serviceUrl: service.baseUrl }));
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.displayName || !formData.serviceUrl || !formData.apiKey || !formData.instanceId) {
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
          phone_number: formData.instanceId, // Use instance ID as identifier
          phone_number_id: formData.instanceId,
          business_account_id: selectedService,
          access_token: formData.apiKey, // Store API key here
          display_name: formData.displayName,
          is_active: true,
          connection_type: 'external_qr',
          external_service_url: formData.serviceUrl,
          external_api_key: formData.apiKey,
          external_instance_id: formData.instanceId,
        })
        .select('id')
        .single();

      if (error) throw error;

      toast({
        title: "¡Cuenta configurada!",
        description: "Ahora configura el webhook en tu servicio externo.",
      });

      // Store account ID to show webhook URL
      setSavedAccount({ id: data.id, name: formData.displayName });

      setFormData({
        displayName: '',
        serviceUrl: '',
        apiKey: '',
        instanceId: '',
      });
      setSelectedService('');
      
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

  const selectedServiceData = SERVICES.find(s => s.id === selectedService);

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
            Ahora configura el webhook en tu servicio externo para recibir mensajes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription>
              <strong>Paso importante:</strong> Copia esta URL y configúrala como webhook en el panel de tu servicio externo (WuzAPI, Z-API, etc.)
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
              <li>1. Ve al panel de administración de WuzAPI</li>
              <li>2. Activa la opción "Activar Webhook"</li>
              <li>3. Pega la URL de arriba en el campo de webhook</li>
              <li>4. Guarda los cambios</li>
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
        <CardTitle className="font-display">Conexión por QR - Servicio Externo</CardTitle>
        <CardDescription>
          Conecta WhatsApp escaneando un código QR usando un servicio externo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Requiere servicio externo</strong> - Debes crear una cuenta en uno de estos servicios 
            y obtener tus credenciales. El escaneo del QR se hace en el panel del servicio.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Selecciona un servicio</Label>
            <Select value={selectedService} onValueChange={handleServiceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un proveedor..." />
              </SelectTrigger>
              <SelectContent>
                {SERVICES.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{service.name}</span>
                      <span className="text-xs text-muted-foreground">{service.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedServiceData && selectedServiceData.url && (
            <Alert className="bg-muted/50">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertDescription className="flex items-center justify-between">
                <span>Crea tu cuenta en {selectedServiceData.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(selectedServiceData.url, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Ir al sitio
                </Button>
              </AlertDescription>
            </Alert>
          )}

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
            <Label htmlFor="serviceUrl">URL del servicio *</Label>
            <Input
              id="serviceUrl"
              placeholder="https://api.ejemplo.com"
              value={formData.serviceUrl}
              onChange={(e) => handleInputChange('serviceUrl', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instanceId">ID de instancia *</Label>
            <Input
              id="instanceId"
              placeholder="Tu ID de instancia del servicio"
              value={formData.instanceId}
              onChange={(e) => handleInputChange('instanceId', e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Lo encuentras en el panel del servicio después de crear una instancia
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key / Token *</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Tu clave de API del servicio"
              value={formData.apiKey}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving || !selectedService}
              className="flex-1 bg-gradient-hero hover:opacity-90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Conectar Servicio'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t">
          <h4 className="font-medium mb-3">Pasos para conectar con WuzAPI:</h4>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-bold text-primary">1.</span>
              Instala y configura WuzAPI en tu servidor
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">2.</span>
              Escanea el código QR en el panel de WuzAPI
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">3.</span>
              Copia la URL del servidor y el Token de la API
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">4.</span>
              Pega los datos aquí y guarda
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">5.</span>
              Configura el webhook en WuzAPI con la URL que te daremos
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
