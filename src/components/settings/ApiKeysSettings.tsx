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
  Eye, 
  EyeOff, 
  Save, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Loader2,
  Mic
} from 'lucide-react';
import { VoiceClonesManager } from './VoiceClonesManager';

interface ApiKey {
  id: string;
  provider: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  voice_model_id?: string;
  voice_name?: string;
}

export const ApiKeysSettings = () => {
  const queryClient = useQueryClient();
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [fishAudioApiKey, setFishAudioApiKey] = useState('');
  const [fishAudioVoiceId, setFishAudioVoiceId] = useState('');
  const [fishAudioVoiceName, setFishAudioVoiceName] = useState('');
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showFishAudioKey, setShowFishAudioKey] = useState(false);
  const [elevenApiKey, setElevenApiKey] = useState('');
  const [elevenVoiceId, setElevenVoiceId] = useState('');
  const [elevenVoiceName, setElevenVoiceName] = useState('');
  const [showElevenKey, setShowElevenKey] = useState(false);

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
  const fishAudioKey = apiKeys?.find(k => k.provider === 'fish_audio');
  const elevenLabsKey = apiKeys?.find(k => k.provider === 'elevenlabs');

  const saveMutation = useMutation({
    mutationFn: async ({ provider, apiKey, voiceModelId, voiceName }: { 
      provider: string; 
      apiKey: string; 
      voiceModelId?: string;
      voiceName?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const existingKey = apiKeys?.find(k => k.provider === provider);

      if (existingKey) {
        const updateData: any = { 
          api_key: apiKey, 
          is_active: true, 
          updated_at: new Date().toISOString() 
        };
        if (voiceModelId !== undefined) updateData.voice_model_id = voiceModelId;
        if (voiceName !== undefined) updateData.voice_name = voiceName;

        const { error } = await supabase
          .from('user_api_keys')
          .update(updateData)
          .eq('id', existingKey.id);
        if (error) throw error;
      } else {
        const insertData: any = { user_id: user.id, provider, api_key: apiKey };
        if (voiceModelId) insertData.voice_model_id = voiceModelId;
        if (voiceName) insertData.voice_name = voiceName;

        const { error } = await supabase
          .from('user_api_keys')
          .insert(insertData);
        if (error) throw error;
      }
    },
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      const providerName =
        provider === 'google_ai' ? 'Google AI' :
        provider === 'fish_audio' ? 'Fish Audio' :
        provider === 'elevenlabs' ? 'ElevenLabs' : provider;
      toast.success(`API Key de ${providerName} guardada`);
      if (provider === 'google_ai') setGoogleApiKey('');
      else if (provider === 'fish_audio') {
        setFishAudioApiKey('');
        setFishAudioVoiceId('');
        setFishAudioVoiceName('');
      } else if (provider === 'elevenlabs') {
        setElevenApiKey('');
        setElevenVoiceId('');
        setElevenVoiceName('');
      }
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
      const providerName =
        provider === 'google_ai' ? 'Google AI' :
        provider === 'fish_audio' ? 'Fish Audio' :
        provider === 'elevenlabs' ? 'ElevenLabs' : provider;
      toast.success(`API Key de ${providerName} eliminada`);
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
              Conecta tus propias cuentas de Google AI y Fish Audio para tener control total 
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

      {/* Fish Audio Card - Voice Cloning */}
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                <Mic className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Fish Audio
                  <Badge variant="outline" className="text-xs">Voice Cloning</Badge>
                </CardTitle>
                <CardDescription>
                  Clona voces de personajes y responde con audios automáticos
                </CardDescription>
              </div>
            </div>
            {fishAudioKey ? (
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
          {fishAudioKey ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm">
                    {showFishAudioKey ? fishAudioKey.api_key : maskApiKey(fishAudioKey.api_key)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowFishAudioKey(!showFishAudioKey)}
                  >
                    {showFishAudioKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate('fish_audio')}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              
              {/* Voice Model Info */}
              {fishAudioKey.voice_model_id && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-800">
                      Voz: {fishAudioKey.voice_name || 'Personalizada'}
                    </span>
                  </div>
                  <code className="text-xs text-emerald-600 mt-1 block">
                    ID: {fishAudioKey.voice_model_id}
                  </code>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Última actualización: {new Date(fishAudioKey.updated_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fish-audio-api-key">API Key</Label>
                <Input
                  id="fish-audio-api-key"
                  type="password"
                  value={fishAudioApiKey}
                  onChange={(e) => setFishAudioApiKey(e.target.value)}
                  placeholder="Tu API key de Fish Audio"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fish-audio-voice-id">ID del Modelo de Voz</Label>
                  <Input
                    id="fish-audio-voice-id"
                    value={fishAudioVoiceId}
                    onChange={(e) => setFishAudioVoiceId(e.target.value)}
                    placeholder="abc123..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fish-audio-voice-name">Nombre de la Voz</Label>
                  <Input
                    id="fish-audio-voice-name"
                    value={fishAudioVoiceName}
                    onChange={(e) => setFishAudioVoiceName(e.target.value)}
                    placeholder="Mi personaje"
                  />
                </div>
              </div>
              
              <Button
                onClick={() => saveMutation.mutate({ 
                  provider: 'fish_audio', 
                  apiKey: fishAudioApiKey,
                  voiceModelId: fishAudioVoiceId || undefined,
                  voiceName: fishAudioVoiceName || undefined,
                })}
                disabled={!fishAudioApiKey.trim() || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar Configuración
              </Button>
            </div>
          )}
          
          <div className="pt-2 border-t space-y-2">
            <a
              href="https://fish.audio"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Ir a Fish Audio
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-xs text-muted-foreground">
              Clona voces de personajes y obtén el ID del modelo para usarlo en el chatbot
            </p>
          </div>

          {fishAudioKey && <VoiceClonesManager />}
        </CardContent>
      </Card>

      {/* ElevenLabs Card - Voice Cloning */}
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
                <Mic className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  ElevenLabs
                  <Badge variant="outline" className="text-xs">Voice Cloning</Badge>
                </CardTitle>
                <CardDescription>
                  Alternativa premium para clonar voces con calidad de estudio
                </CardDescription>
              </div>
            </div>
            {elevenLabsKey ? (
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
          {elevenLabsKey ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm">
                    {showElevenKey ? elevenLabsKey.api_key : maskApiKey(elevenLabsKey.api_key)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setShowElevenKey(!showElevenKey)}>
                    {showElevenKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

              {elevenLabsKey.voice_model_id && (
                <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-medium text-violet-800">
                      Voz: {elevenLabsKey.voice_name || 'Personalizada'}
                    </span>
                  </div>
                  <code className="text-xs text-violet-600 mt-1 block">
                    ID: {elevenLabsKey.voice_model_id}
                  </code>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Última actualización: {new Date(elevenLabsKey.updated_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="eleven-api-key">API Key</Label>
                <Input
                  id="eleven-api-key"
                  type="password"
                  value={elevenApiKey}
                  onChange={(e) => setElevenApiKey(e.target.value)}
                  placeholder="sk_..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="eleven-voice-id">Voice ID</Label>
                  <Input
                    id="eleven-voice-id"
                    value={elevenVoiceId}
                    onChange={(e) => setElevenVoiceId(e.target.value)}
                    placeholder="21m00Tcm4TlvDq8ikWAM"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eleven-voice-name">Nombre de la Voz</Label>
                  <Input
                    id="eleven-voice-name"
                    value={elevenVoiceName}
                    onChange={(e) => setElevenVoiceName(e.target.value)}
                    placeholder="Mi voz"
                  />
                </div>
              </div>

              <Button
                onClick={() => saveMutation.mutate({
                  provider: 'elevenlabs',
                  apiKey: elevenApiKey,
                  voiceModelId: elevenVoiceId || undefined,
                  voiceName: elevenVoiceName || undefined,
                })}
                disabled={!elevenApiKey.trim() || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar Configuración
              </Button>
            </div>
          )}

          <div className="pt-2 border-t space-y-2">
            <a
              href="https://elevenlabs.io/app/voice-lab"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Ir a ElevenLabs Voice Lab
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-xs text-muted-foreground">
              Crea o clona una voz en ElevenLabs y copia su Voice ID desde el Voice Lab.
            </p>
          </div>

          {elevenLabsKey && <VoiceClonesManager provider="elevenlabs" />}
        </CardContent>
      </Card>
    </div>
  );
};
