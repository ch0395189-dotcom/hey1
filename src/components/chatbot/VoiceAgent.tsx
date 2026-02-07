import { useState, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  agentId?: string;
  onAgentIdChange?: (agentId: string) => void;
}

export const VoiceAgent = ({ agentId: initialAgentId, onAgentIdChange }: VoiceAgentProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [agentId, setAgentId] = useState(initialAgentId || '');
  const [showConfig, setShowConfig] = useState(!initialAgentId);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs agent');
      toast.success('Conectado al agente de voz');
    },
    onDisconnect: () => {
      console.log('Disconnected from ElevenLabs agent');
      toast.info('Desconectado del agente');
      setIsConnecting(false);
    },
    onMessage: (message: any) => {
      console.log('Message from agent:', message);
      
      const messageType = message?.type || message?.message_type;
      
      if (messageType === 'user_transcript') {
        const userText = message?.user_transcription_event?.user_transcript || message?.text;
        if (userText) {
          setTranscript(prev => [...prev, { role: 'user', text: userText }]);
        }
      }
      
      if (messageType === 'agent_response') {
        const agentText = message?.agent_response_event?.agent_response || message?.text;
        if (agentText) {
          setTranscript(prev => [...prev, { role: 'agent', text: agentText }]);
        }
      }
    },
    onError: (error: any) => {
      console.error('ElevenLabs error:', error);
      toast.error('Error de conexión con el agente');
      setIsConnecting(false);
    },
  });

  const startConversation = useCallback(async () => {
    if (!agentId.trim()) {
      toast.error('Ingresa el ID del agente de ElevenLabs');
      return;
    }

    setIsConnecting(true);
    setTranscript([]);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Try to get token from edge function first (if configured)
      try {
        const { data, error } = await supabase.functions.invoke('elevenlabs-conversation-token', {
          body: { agentId }
        });

        if (data?.token) {
          // Use authenticated connection
          await conversation.startSession({
            conversationToken: data.token,
            connectionType: 'webrtc',
          } as any);
          return;
        }
      } catch (e) {
        console.log('No token endpoint, trying public agent connection');
      }

      // Fallback to public agent connection
      await conversation.startSession({
        agentId: agentId.trim(),
        connectionType: 'webrtc',
      } as any);

      if (onAgentIdChange) {
        onAgentIdChange(agentId);
      }
    } catch (error: any) {
      console.error('Failed to start conversation:', error);
      toast.error(error.message || 'Error al iniciar la conversación');
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, agentId, onAgentIdChange]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const toggleMute = useCallback(async () => {
    try {
      await conversation.setVolume({ volume: isMuted ? 1 : 0 });
      setIsMuted(!isMuted);
    } catch (e) {
      console.error('Error toggling mute:', e);
    }
  }, [conversation, isMuted]);

  const isConnected = conversation.status === 'connected';
  const isSpeaking = conversation.isSpeaking;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-violet-500/10 to-purple-500/10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-violet-500" />
              Agente de Voz IA
            </CardTitle>
            <CardDescription>
              Conversación en tiempo real con inteligencia artificial
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
        {/* Configuration Section */}
        <AnimatePresence>
          {(showConfig || !agentId) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 p-4 rounded-lg border bg-muted/30"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Settings className="h-4 w-4" />
                Configuración del Agente
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-id">ID del Agente (ElevenLabs)</Label>
                <Input
                  id="agent-id"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="ej: abc123xyz..."
                  disabled={isConnected}
                />
                <p className="text-xs text-muted-foreground">
                  Obtén el ID desde tu panel de{' '}
                  <a 
                    href="https://elevenlabs.io/convai" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    ElevenLabs Conversational AI
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-600">Requisitos:</p>
                    <ul className="text-muted-foreground text-xs mt-1 space-y-1">
                      <li>• Crear un agente en ElevenLabs</li>
                      <li>• Configurar el agente como público o agregar ELEVENLABS_API_KEY</li>
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
                  ? 'bg-gradient-to-br from-violet-500 to-purple-600' 
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
                  className="absolute inset-0 rounded-full border-4 border-violet-400"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-violet-400"
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
                  ? '🎙️ El agente está hablando...'
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
              disabled={isConnecting || !agentId.trim()}
              className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
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
                      : 'bg-violet-500/10 mr-8'
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
        {agentId && (
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
