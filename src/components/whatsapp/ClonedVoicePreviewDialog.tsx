import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

interface VoiceOption {
  voice_model_id: string;
  voice_name: string;
  is_default?: boolean;
  provider?: string;
  source?: 'saved' | 'fish_auto';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  defaultVoice: { voiceModelId: string; voiceName: string | null; provider?: string } | null;
  onConfirm: (audioBlob: Blob, voice: VoiceOption) => Promise<void>;
}

export const ClonedVoicePreviewDialog = ({ open, onOpenChange, text, defaultVoice, onConfirm }: Props) => {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Load voices when opened
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingVoices(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingVoices(false); return; }
      const { data } = await supabase
        .from('user_voice_clones')
        .select('voice_model_id, voice_name, is_default, provider')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      const list: VoiceOption[] = (data || []).map((v: any) => ({ ...v, source: 'saved' as const }));
      // Fallback: include legacy single voice from user_api_keys if no clones saved
      if (list.length === 0 && defaultVoice?.voiceModelId) {
        list.push({
          voice_model_id: defaultVoice.voiceModelId,
          voice_name: defaultVoice.voiceName || 'Voz personalizada',
          is_default: true,
          provider: defaultVoice.provider || 'fish_audio',
          source: 'saved',
        });
      }

      // Auto-fetch Fish Audio voices from user's account using their API key
      try {
        const { data: fishKey } = await supabase
          .from('user_api_keys')
          .select('id')
          .eq('user_id', user.id)
          .eq('provider', 'fish_audio')
          .eq('is_active', true)
          .maybeSingle();

        if (fishKey) {
          const { data: { session } } = await supabase.auth.getSession();
          const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
          const res = await fetch(`${supabaseUrl}/functions/v1/fish-audio-list-voices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
          });
          if (res.ok) {
            const json = await res.json();
            const remote: VoiceOption[] = (json?.voices || []).map((v: any) => ({
              voice_model_id: v.voice_model_id,
              voice_name: v.voice_name,
              provider: 'fish_audio',
              source: 'fish_auto' as const,
            }));
            // Merge: avoid duplicates by voice_model_id
            const existing = new Set(list.map(l => l.voice_model_id));
            for (const r of remote) {
              if (!existing.has(r.voice_model_id)) list.push(r);
            }
          }
        }
      } catch (e) {
        console.warn('Could not auto-load Fish Audio voices', e);
      }

      setVoices(list);
      const initial = list.find(v => v.is_default) || list[0];
      if (initial) setSelectedVoiceId(initial.voice_model_id);
      setLoadingVoices(false);
    })();
  }, [open, defaultVoice]);

  // Reset audio when dialog closes
  useEffect(() => {
    if (!open) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setGenerating(false);
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset preview when voice changes
  useEffect(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVoiceId]);

  const handleGenerate = async () => {
    if (!selectedVoiceId || !text.trim()) return;
    const voice = voices.find(v => v.voice_model_id === selectedVoiceId);
    if (!voice) return;
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!user) throw new Error('Sesión no válida');

      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const fnName = voice.provider === 'elevenlabs' ? 'elevenlabs-tts' : 'fish-audio-tts';
      const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ text: text.trim(), voiceModelId: selectedVoiceId, userId: user.id }),
      });

      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const j = await res.json(); msg = j?.error || msg; } catch {}
        throw new Error(msg);
      }

      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error('Error al generar audio: ' + (e?.message || 'desconocido'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    const voice = voices.find(v => v.voice_model_id === selectedVoiceId);
    if (!voice) return;
    setSending(true);
    try {
      await onConfirm(audioBlob, voice);
      onOpenChange(false);
    } catch {
      // toast handled upstream
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            Nota de voz clonada
          </DialogTitle>
          <DialogDescription>
            Elige una voz, genera el audio y escúchalo antes de enviarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg text-sm max-h-32 overflow-y-auto">
            {text || <span className="text-muted-foreground italic">Sin texto</span>}
          </div>

          <div className="space-y-2">
            <Label>Voz</Label>
            {loadingVoices ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando voces...
              </div>
            ) : voices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tienes voces configuradas. Agrega una desde Ajustes → Claves de API → Fish Audio.
              </p>
            ) : (
              <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una voz" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.voice_model_id} value={v.voice_model_id}>
                      {v.voice_name}
                      {v.provider === 'elevenlabs' ? ' · ElevenLabs' : ' · Fish Audio'}
                      {v.is_default && ' ★'}
                      {v.source === 'fish_auto' && ' (cuenta)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!loadingVoices && voices.some(v => v.source === 'fish_auto') && (
              <p className="text-[11px] text-muted-foreground">
                Las voces marcadas (cuenta) se cargaron automáticamente desde tu Fish Audio.
              </p>
            )}
          </div>

          {audioUrl && (
            <div className="space-y-2">
              <Label>Vista previa</Label>
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={generating || sending || !selectedVoiceId || !text.trim()}
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : audioUrl ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {audioUrl ? 'Regenerar' : 'Generar'}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!audioBlob || sending || generating}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};