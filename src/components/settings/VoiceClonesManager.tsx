import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEffectiveUser } from '@/lib/effectiveAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Mic, Plus, Star, Trash2, Loader2, Save, X } from 'lucide-react';

interface VoiceClone {
  id: string;
  voice_name: string;
  voice_model_id: string;
  is_default: boolean;
  created_at: string;
  provider: string;
}

interface Props {
  provider?: 'fish_audio' | 'elevenlabs';
}

export const VoiceClonesManager = ({ provider = 'fish_audio' }: Props) => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [voiceModelId, setVoiceModelId] = useState('');

  const { data: voices, isLoading } = useQuery({
    queryKey: ['user-voice-clones', provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_voice_clones')
        .select('*')
        .eq('provider', provider)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as VoiceClone[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getEffectiveUser();
      if (!user) throw new Error('No autenticado');
      const isFirst = !voices || voices.length === 0;
      const { error } = await supabase.from('user_voice_clones').insert({
        user_id: user.id,
        voice_name: voiceName.trim(),
        voice_model_id: voiceModelId.trim(),
        is_default: isFirst,
        provider,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-voice-clones'] });
      toast.success('Voz agregada');
      setVoiceName('');
      setVoiceModelId('');
      setShowForm(false);
    },
    onError: (e) => toast.error('Error: ' + (e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_voice_clones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-voice-clones'] });
      toast.success('Voz eliminada');
    },
    onError: (e) => toast.error('Error: ' + (e as Error).message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await getEffectiveUser();
      if (!user) throw new Error('No autenticado');
      await supabase
        .from('user_voice_clones')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('provider', provider);
      const { error } = await supabase.from('user_voice_clones').update({ is_default: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-voice-clones'] });
      toast.success('Voz predeterminada actualizada');
    },
    onError: (e) => toast.error('Error: ' + (e as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">
            Mis voces clonadas {provider === 'elevenlabs' ? '(ElevenLabs)' : '(Fish Audio)'}
          </h4>
          <p className="text-xs text-muted-foreground">
            Guarda varias voces y elige cuál usar en cada chat.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Agregar voz
          </Button>
        )}
      </div>

      {showForm && (
        <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="vc-name" className="text-xs">Nombre</Label>
              <Input
                id="vc-name"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="Mi voz / Personaje X"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vc-id" className="text-xs">Voice Model ID</Label>
              <Input
                id="vc-id"
                value={voiceModelId}
                onChange={(e) => setVoiceModelId(e.target.value)}
                placeholder="abc123..."
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!voiceName.trim() || !voiceModelId.trim() || addMutation.isPending}
              className="gap-1"
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setVoiceName(''); setVoiceModelId(''); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {voices && voices.length > 0 ? (
        <div className="space-y-2">
          {voices.map((v) => (
            <div key={v.id} className="flex items-center justify-between p-2 rounded-lg border bg-background">
              <div className="flex items-center gap-2 min-w-0">
                <Mic className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{v.voice_name}</span>
                    {v.is_default && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Star className="h-3 w-3" /> Predeterminada
                      </Badge>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground truncate block">{v.voice_model_id}</code>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!v.is_default && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDefaultMutation.mutate(v.id)}
                    disabled={setDefaultMutation.isPending}
                    title="Marcar como predeterminada"
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(v.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-xs text-muted-foreground italic">
            Aún no tienes voces. Agrega una para empezar.
          </p>
        )
      )}
    </div>
  );
};