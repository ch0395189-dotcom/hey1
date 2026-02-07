import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bot, Workflow, MessageSquare, Plus, Trash2, Save, BookOpen, Sparkles, Mic, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeywordManager } from './KeywordManager';
import { FlowBuilder } from './FlowBuilder';
import { KnowledgeBase } from './KnowledgeBase';
import { AIConfig } from './AIConfig';
import { VoiceAgent } from './VoiceAgent';

interface ChatbotConfigProps {
  whatsappAccountId: string;
  whatsappAccountName: string;
}

interface ChatbotConfigData {
  id?: string;
  whatsapp_account_id: string;
  name: string;
  is_enabled: boolean;
  mode: 'manual' | 'ai' | 'hybrid';
  ai_system_prompt: string;
  ai_greeting: string;
  escalation_keywords: string[];
  welcome_message: string;
  fallback_message: string;
  auto_end_on_leaf: boolean;
}

export const ChatbotConfig = ({ whatsappAccountId, whatsappAccountName }: ChatbotConfigProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ChatbotConfigData>({
    whatsapp_account_id: whatsappAccountId,
    name: 'Mi Chatbot',
    is_enabled: false,
    mode: 'manual',
    ai_system_prompt: 'Eres un asistente amable y profesional. Responde de manera concisa y útil.',
    ai_greeting: '¡Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?',
    escalation_keywords: ['agente', 'humano', 'persona', 'hablar con alguien'],
    welcome_message: '¡Hola! Bienvenido. ¿En qué puedo ayudarte?',
    fallback_message: 'No entendí tu mensaje. ¿Podrías reformularlo?',
    auto_end_on_leaf: false,
  });
  const [useAiFallback, setUseAiFallback] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');

  useEffect(() => {
    fetchConfig();
  }, [whatsappAccountId]);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chatbot_configs')
      .select('*')
      .eq('whatsapp_account_id', whatsappAccountId)
      .single();

    if (data) {
      setConfig(data as ChatbotConfigData);
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      if (config.id) {
        const { error } = await supabase
          .from('chatbot_configs')
          .update({
            name: config.name,
            is_enabled: config.is_enabled,
            mode: config.mode,
            ai_system_prompt: config.ai_system_prompt,
            ai_greeting: config.ai_greeting,
            escalation_keywords: config.escalation_keywords,
            welcome_message: config.welcome_message,
            fallback_message: config.fallback_message,
            auto_end_on_leaf: config.auto_end_on_leaf,
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('chatbot_configs')
          .insert({
            whatsapp_account_id: whatsappAccountId,
            name: config.name,
            is_enabled: config.is_enabled,
            mode: config.mode,
            ai_system_prompt: config.ai_system_prompt,
            ai_greeting: config.ai_greeting,
            escalation_keywords: config.escalation_keywords,
            welcome_message: config.welcome_message,
            fallback_message: config.fallback_message,
            auto_end_on_leaf: config.auto_end_on_leaf,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setConfig(data as ChatbotConfigData);
      }

      toast.success('Configuración guardada correctamente');
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error('Error al guardar la configuración');
    }
    setSaving(false);
  };

  const addEscalationKeyword = () => {
    if (newKeyword.trim() && !config.escalation_keywords.includes(newKeyword.trim())) {
      setConfig({
        ...config,
        escalation_keywords: [...config.escalation_keywords, newKeyword.trim()],
      });
      setNewKeyword('');
    }
  };

  const removeEscalationKeyword = (keyword: string) => {
    setConfig({
      ...config,
      escalation_keywords: config.escalation_keywords.filter(k => k !== keyword),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Configuración del Chatbot
          </h2>
          <p className="text-muted-foreground">
            Cuenta: {whatsappAccountName}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.is_enabled}
              onCheckedChange={(checked) => setConfig({ ...config, is_enabled: checked })}
              id="bot-enabled"
            />
            <Label htmlFor="bot-enabled" className="font-medium">
              {config.is_enabled ? 'Activo' : 'Inactivo'}
            </Label>
          </div>
          <Button onClick={saveConfig} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto gap-1 p-1">
          <TabsTrigger value="general" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">General</span>
            <span className="sm:hidden">Gral</span>
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-xs sm:text-sm">
            <Workflow className="h-4 w-4 shrink-0" />
            <span>Flujo</span>
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-xs sm:text-sm">
            <Bot className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Keywords</span>
            <span className="sm:hidden">Keys</span>
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-xs sm:text-sm">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Conocimiento</span>
            <span className="sm:hidden">Info</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-xs sm:text-sm">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>IA</span>
          </TabsTrigger>
          <TabsTrigger value="voice" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-xs sm:text-sm">
            <Mic className="h-4 w-4 shrink-0" />
            <span>Voz</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Configuración General</CardTitle>
              <CardDescription>
                Configura el comportamiento básico del chatbot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bot-name">Nombre del Bot</Label>
                  <Input
                    id="bot-name"
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    placeholder="Mi Chatbot"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot-mode">Modo de Operación</Label>
                  <Select
                    value={config.mode}
                    onValueChange={(value: 'manual' | 'ai' | 'hybrid') => setConfig({ ...config, mode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar modo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">
                        <div className="flex items-center gap-2">
                          <Workflow className="h-4 w-4" />
                          <span>Flujo Manual</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ai">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          <span>Solo IA</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="hybrid">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          <span>Híbrido (Manual + IA)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {config.mode === 'manual' && 'Responde solo con flujos y palabras clave configuradas'}
                    {config.mode === 'ai' && 'Responde usando inteligencia artificial'}
                    {config.mode === 'hybrid' && 'Usa flujos manuales con IA como respaldo'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="welcome-message">Mensaje de Bienvenida</Label>
                <Textarea
                  id="welcome-message"
                  value={config.welcome_message}
                  onChange={(e) => setConfig({ ...config, welcome_message: e.target.value })}
                  placeholder="¡Hola! Bienvenido..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallback-message">Mensaje de Fallback</Label>
                <Textarea
                  id="fallback-message"
                  value={config.fallback_message}
                  onChange={(e) => setConfig({ ...config, fallback_message: e.target.value })}
                  placeholder="No entendí tu mensaje..."
                  rows={2}
                />
                <p className="text-sm text-muted-foreground">
                  Se envía cuando el bot no puede procesar el mensaje
                </p>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-end-leaf" className="font-medium">
                    Finalizar bot en último nodo
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Cuando el flujo llegue al final (nodo sin hijos), el bot se desactiva y continúa atención manual
                  </p>
                </div>
                <Switch
                  id="auto-end-leaf"
                  checked={config.auto_end_on_leaf}
                  onCheckedChange={(checked) => setConfig({ ...config, auto_end_on_leaf: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Palabras Clave para Escalar a Humano</Label>
                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Agregar palabra clave..."
                    onKeyDown={(e) => e.key === 'Enter' && addEscalationKeyword()}
                  />
                  <Button onClick={addEscalationKeyword} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <AnimatePresence>
                    {config.escalation_keywords.map((keyword) => (
                      <motion.span
                        key={keyword}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                      >
                        {keyword}
                        <button
                          onClick={() => removeEscalationKeyword(keyword)}
                          className="hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cuando el usuario mencione estas palabras, el bot transferirá la conversación a un agente humano
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flow">
          {config.id ? (
            <FlowBuilder chatbotConfigId={config.id} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  Guarda la configuración primero para crear el flujo de conversación
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="keywords">
          {config.id ? (
            <KeywordManager chatbotConfigId={config.id} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  Guarda la configuración primero para agregar palabras clave
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="knowledge">
          {config.id ? (
            <KnowledgeBase chatbotConfigId={config.id} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  Guarda la configuración primero para agregar conocimiento
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ai">
          <AIConfig
            aiGreeting={config.ai_greeting}
            aiSystemPrompt={config.ai_system_prompt}
            isEnabled={useAiFallback}
            onGreetingChange={(value) => setConfig({ ...config, ai_greeting: value })}
            onSystemPromptChange={(value) => setConfig({ ...config, ai_system_prompt: value })}
            onEnabledChange={(value) => {
              setUseAiFallback(value);
              // Update mode based on AI state
              if (value) {
                setConfig({ ...config, mode: 'hybrid' });
              } else {
                setConfig({ ...config, mode: 'manual' });
              }
            }}
          />
        </TabsContent>

        <TabsContent value="voice">
          <VoiceAgent />
        </TabsContent>

      </Tabs>
    </div>
  );
};
