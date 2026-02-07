import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Key, 
  Sparkles, 
  Waves, 
  Eye, 
  EyeOff, 
  Save, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface ApiKey {
  id: string;
  provider: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const ApiKeysSettings = () => {
  const queryClient = useQueryClient();
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showElevenlabsKey, setShowElevenlabsKey] = useState(false);

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['user-api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('*');
      
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  const googleKey = apiKeys?.find(k => k.provider === 'google_ai');
  const elevenlabsKey = apiKeys?.find(k => k.provider === 'elevenlabs');

  const saveMutation = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: string; apiKey: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const existingKey = apiKeys?.find(k => k.provider === provider);

      if (existingKey) {
        const { error } = await supabase
          .from('user_api_keys')
          .update({ api_key: apiKey, is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existingKey.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_api_keys')
          .insert({ user_id: user.id, provider, api_key: apiKey });
        if (error) throw error;
      }
    },
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      toast.success(`API Key de ${provider === 'google_ai' ? 'Google AI' : 'ElevenLabs'} guardada`);
      if (provider === 'google_ai') setGoogleApiKey('');
      else setElevenlabsApiKey('');
    },
    onError: (error) => {
      toast.error('Error al guardar: ' + (error as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (provider: string) => {
      const existingKey = apiKeys?.find(k => k.provider === provider);
      if (!existingKey) return;

      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('id', existingKey.id);
      if (error) throw error;
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      toast.success(`API Key de ${provider === 'google_ai' ? 'Google AI' : 'ElevenLabs'} eliminada`);
    },
    onError: (error) => {
      toast.error('Error al eliminar: ' + (error as Error).message);
    },
  });

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Key className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Claves de API</h2>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Tus propias API Keys</h4>
            <p className="text-sm text-amber-700 mt-1">
              Conecta tus propias cuentas de Google AI y ElevenLabs para tener control total 
              sobre el uso y costos de los servicios de IA.
            </p>
          </div>
        </div>
      </div>

      {/* Google AI Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
                <Sparkles className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Google AI (Gemini)</CardTitle>
                <CardDescription>
                  Para respuestas automáticas del chatbot con IA
                </CardDescription>
              </div>
            </div>
            {googleKey ? (
              <Badge className="bg-green-500 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Configurado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                No configurado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleKey ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm">
                    {showGoogleKey ? googleKey.api_key : maskApiKey(googleKey.api_key)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowGoogleKey(!showGoogleKey)}
                  >
                    {showGoogleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate('google_ai')}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Última actualización: {new Date(googleKey.updated_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="google-api-key">API Key</Label>
                <Input
                  id="google-api-key"
                  type="password"
                  value={googleApiKey}
                  onChange={(e) => setGoogleApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate({ provider: 'google_ai', apiKey: googleApiKey })}
                disabled={!googleApiKey.trim() || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar API Key
              </Button>
            </div>
          )}
          
          <div className="pt-2 border-t">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Obtener API Key de Google AI Studio
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ElevenLabs Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10">
                <Waves className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-lg">ElevenLabs</CardTitle>
                <CardDescription>
                  Para agentes de voz en tiempo real
                </CardDescription>
              </div>
            </div>
            {elevenlabsKey ? (
              <Badge className="bg-green-500 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Configurado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                No configurado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {elevenlabsKey ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm">
                    {showElevenlabsKey ? elevenlabsKey.api_key : maskApiKey(elevenlabsKey.api_key)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowElevenlabsKey(!showElevenlabsKey)}
                  >
                    {showElevenlabsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate('elevenlabs')}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Última actualización: {new Date(elevenlabsKey.updated_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="elevenlabs-api-key">API Key</Label>
                <Input
                  id="elevenlabs-api-key"
                  type="password"
                  value={elevenlabsApiKey}
                  onChange={(e) => setElevenlabsApiKey(e.target.value)}
                  placeholder="sk_..."
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate({ provider: 'elevenlabs', apiKey: elevenlabsApiKey })}
                disabled={!elevenlabsApiKey.trim() || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar API Key
              </Button>
            </div>
          )}
          
          <div className="pt-2 border-t">
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Obtener API Key de ElevenLabs
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Usage info */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <h4 className="font-medium mb-2">💡 ¿Cómo funcionan las API Keys?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>Google AI:</strong> Se usa para el chatbot automático cuando está en modo IA o híbrido</li>
            <li>• <strong>ElevenLabs:</strong> Se usa para conversaciones de voz en tiempo real</li>
            <li>• Las keys se almacenan de forma segura y solo tú puedes verlas</li>
            <li>• Puedes cambiar o eliminar tus keys en cualquier momento</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
