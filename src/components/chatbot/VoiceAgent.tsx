import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Volume2, 
  VolumeX,
  Loader2,
  Settings,
  MessageSquare,
  Waves,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceAgentProps {
  voiceModelId?: string;
  onVoiceModelIdChange?: (voiceModelId: string) => void;
}

export const VoiceAgent = ({ voiceModelId: initialVoiceModelId, onVoiceModelIdChange }: VoiceAgentProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [voiceModelId, setVoiceModelId] = useState(initialVoiceModelId || '');
  const [showConfig, setShowConfig] = useState(!initialVoiceModelId);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = async (event) => {
        const last = event.results.length - 1;
        const userText = event.results[last][0].transcript;
        
        if (userText.trim()) {
          setTranscript(prev => [...prev, { role: 'user', text: userText }]);
          await generateAudioResponse(userText);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          toast.error('Error en el reconocimiento de voz');
        }
      };

      recognitionRef.current.onend = () => {
        if (isConnected && isListening) {
          recognitionRef.current?.start();
        }
      };
    }

    return () => {
      recognitionRef.current?.stop();
    };
  }, [isConnected, isListening]);

  const generateAudioResponse = async (userMessage: string) => {
    setIsSpeaking(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get AI response using user's Google AI key or Lovable AI
      let responseText = '';
      
      // Check for user's Google AI API key
      const { data: apiKeyData } = await supabase
        .from('user_api_keys')
        .select('api_key')
        .eq('provider', 'google_ai')
        .eq('is_active', true)
        .maybeSingle();

      if (apiKeyData?.api_key) {
        // Use Google AI directly
        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeyData.api_key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: userMessage }] }],
              systemInstruction: {
                parts: [{ text: 'Eres un asistente de voz amable. Responde de forma concisa y natural, en máximo 2 oraciones. Responde siempre en español.' }]
              },
              generationConfig: { temperature: 0.7, maxOutputTokens: 150 },
            }),
          }
        );
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude generar una respuesta.';
        } else {
          responseText = 'Error al conectar con el servicio de IA.';
        }
      } else {
        // Fallback: use edge function with Lovable AI
        const { data: aiData, error: aiError } = await supabase.functions.invoke('chatbot-process', {
          body: {
            conversation_id: 'voice-agent',
            message_content: userMessage,
            whatsapp_account_id: 'voice-preview',
          },
        });
        responseText = aiData?.response || 'No pude procesar tu mensaje.';
      }
      
      setTranscript(prev => [...prev, { role: 'agent', text: responseText }]);

      // Call Fish Audio TTS
      const { data, error } = await supabase.functions.invoke('fish-audio-tts', {
        body: { 
          text: responseText,
          voiceModelId: voiceModelId || undefined,
          userId: user?.id
        }
      });

      if (error) {
        throw error;
      }

      // Play the audio response
      if (data) {
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.volume = isMuted ? 0 : 1;
          await audioRef.current.play();
        }
      }
    } catch (error: any) {
      console.error('Error generating audio response:', error);
      toast.error(error.message || 'Error al generar respuesta de audio');
    } finally {
      setIsSpeaking(false);
    }
  };

  const startConversation = useCallback(async () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    setIsConnecting(true);
    setTranscript([]);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      setIsConnected(true);
      setIsListening(true);
      recognitionRef.current?.start();

      toast.success('Conversación iniciada');

      if (onVoiceModelIdChange && voiceModelId) {
        onVoiceModelIdChange(voiceModelId);
      }
    } catch (error: any) {
      console.error('Failed to start conversation:', error);
      toast.error(error.message || 'Error al iniciar la conversación');
    } finally {
      setIsConnecting(false);
    }
  }, [voiceModelId, onVoiceModelIdChange]);

  const stopConversation = useCallback(() => {
    recognitionRef.current?.stop();
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    toast.info('Conversación terminada');
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 1 : 0;
    }
  }, [isMuted]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-orange-500/10 to-red-500/10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-orange-500" />
              Agente de Voz IA (Fish Audio)
            </CardTitle>
            <CardDescription>
              Conversación en tiempo real con voces clonadas
            </CardDescription>
          </div>
          <Badge 
            variant={isConnected ? 'default' : 'secondary'}
            className={isConnected ? 'bg-green-500' : ''}
          >
            {isConnected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Hidden audio element for playback */}
        <audio ref={audioRef} onEnded={() => setIsSpeaking(false)} />

        {/* Configuration Section */}
        <AnimatePresence>
          {(showConfig || !voiceModelId) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 p-4 rounded-lg border bg-muted/30"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Settings className="h-4 w-4" />
                Configuración de Fish Audio
              </div>

              <div className="space-y-2">
                <Label htmlFor="voice-model-id">ID del Modelo de Voz (Opcional)</Label>
                <Input
                  id="voice-model-id"
                  value={voiceModelId}
                  onChange={(e) => setVoiceModelId(e.target.value)}
                  placeholder="ej: abc123xyz..."
                  disabled={isConnected}
                />
                <p className="text-xs text-muted-foreground">
                  Obtén el ID desde tu panel de{' '}
                  <a 
                    href="https://fish.audio" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Fish Audio
                  </a>
                  {' '}para usar una voz clonada
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-600">Requisitos:</p>
                    <ul className="text-muted-foreground text-xs mt-1 space-y-1">
                      <li>• Configurar FISH_AUDIO_API_KEY en Settings</li>
                      <li>• Clonar una voz en Fish Audio (opcional)</li>
                      <li>• Permitir acceso al micrófono</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Interface */}
        <div className="flex flex-col items-center py-8">
          {/* Voice Animation */}
          <motion.div
            className={`relative w-32 h-32 rounded-full flex items-center justify-center ${
              isConnected 
                ? isSpeaking 
                  ? 'bg-gradient-to-br from-orange-500 to-red-600' 
                  : 'bg-gradient-to-br from-green-500 to-emerald-600'
                : 'bg-muted'
            }`}
            animate={isConnected && isSpeaking ? {
              scale: [1, 1.1, 1],
              transition: { repeat: Infinity, duration: 0.5 }
            } : {}}
          >
            {isConnecting ? (
              <Loader2 className="h-12 w-12 text-white animate-spin" />
            ) : isConnected ? (
              isSpeaking ? (
                <Volume2 className="h-12 w-12 text-white" />
              ) : (
                <Mic className="h-12 w-12 text-white" />
              )
            ) : (
              <MicOff className="h-12 w-12 text-muted-foreground" />
            )}

            {/* Pulse rings when speaking */}
            {isConnected && isSpeaking && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-orange-400"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-orange-400"
                  animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 1, delay: 0.3 }}
                />
              </>
            )}
          </motion.div>

          <p className="mt-4 text-sm text-muted-foreground">
            {isConnecting 
              ? 'Conectando...' 
              : isConnected 
                ? isSpeaking 
                  ? '🔊 Reproduciendo respuesta...'
                  : '👂 Escuchando...'
                : 'Presiona para iniciar conversación'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {!isConnected ? (
            <Button
              size="lg"
              onClick={startConversation}
              disabled={isConnecting}
              className="gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
            >
              {isConnecting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Phone className="h-5 w-5" />
              )}
              Iniciar Conversación
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={toggleMute}
                className="gap-2"
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
                {isMuted ? 'Desmutear' : 'Mutear'}
              </Button>
              <Button
                size="lg"
                variant="destructive"
                onClick={stopConversation}
                className="gap-2"
              >
                <PhoneOff className="h-5 w-5" />
                Terminar
              </Button>
            </>
          )}
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              Transcripción
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 p-3 rounded-lg border bg-muted/30">
              {transcript.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-2 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary/10 ml-8'
                      : 'bg-orange-500/10 mr-8'
                  }`}
                >
                  <span className="font-medium text-xs text-muted-foreground">
                    {msg.role === 'user' ? 'Tú' : 'Agente'}:
                  </span>
                  <p>{msg.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle config button */}
        {voiceModelId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
            className="w-full"
          >
            <Settings className="h-4 w-4 mr-2" />
            {showConfig ? 'Ocultar configuración' : 'Mostrar configuración'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
