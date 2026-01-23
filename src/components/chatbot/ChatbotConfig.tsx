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
import { Bot, Workflow, Sparkles, MessageSquare, Plus, Trash2, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeywordManager } from './KeywordManager';
import { FlowBuilder } from './FlowBuilder';

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
}

export const ChatbotConfig = ({ whatsappAccountId, whatsappAccountName }: ChatbotConfigProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ChatbotConfigData>({
    whatsapp_account_id: whatsappAccountId,
    name: 'Mi Chatbot',
    is_enabled: false,
    mode: 'hybrid',
    ai_system_prompt: 'Eres un asistente amable y profesional. Responde de manera concisa y útil.',
    ai_greeting: '¡Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?',
    escalation_keywords: ['agente', 'humano', 'persona', 'hablar con alguien'],
    welcome_message: '¡Hola! Bienvenido. ¿En qué puedo ayudarte?',
    fallback_message: 'No entendí tu mensaje. ¿Podrías reformularlo?',
  });
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Flujo Manual
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Keywords
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Inteligencia Artificial
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
                    onValueChange={(value: 'manual' | 'ai' | 'hybrid') => 
                      setConfig({ ...config, mode: value })
                    }
                  >
                    <SelectTrigger id="bot-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">
                        <div className="flex items-center gap-2">
                          <Workflow className="h-4 w-4" />
                          Solo Flujo Manual
                        </div>
                      </SelectItem>
                      <SelectItem value="ai">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Solo IA
                        </div>
                      </SelectItem>
                      <SelectItem value="hybrid">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          Híbrido (Flujo + IA)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
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

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Configuración de IA
              </CardTitle>
              <CardDescription>
                Personaliza el comportamiento de la inteligencia artificial
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-greeting">Saludo de IA</Label>
                <Textarea
                  id="ai-greeting"
                  value={config.ai_greeting}
                  onChange={(e) => setConfig({ ...config, ai_greeting: e.target.value })}
                  placeholder="¡Hola! Soy un asistente virtual..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-prompt">Prompt del Sistema</Label>
                <Textarea
                  id="ai-prompt"
                  value={config.ai_system_prompt}
                  onChange={(e) => setConfig({ ...config, ai_system_prompt: e.target.value })}
                  placeholder="Eres un asistente amable..."
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">
                  Define la personalidad y comportamiento de la IA. Incluye información sobre tu negocio, productos o servicios.
                </p>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">💡 Tips para el prompt:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Describe el rol del asistente (ej: "Eres el asistente de ventas de...")</li>
                  <li>• Incluye información de productos/servicios</li>
                  <li>• Define el tono (formal, casual, amigable)</li>
                  <li>• Especifica qué información NO debe compartir</li>
                  <li>• Indica cuándo debe escalar a un humano</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
