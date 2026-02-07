import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, DollarSign, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AIConfigProps {
  aiGreeting: string;
  aiSystemPrompt: string;
  isEnabled: boolean;
  onGreetingChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
}

export const AIConfig = ({
  aiGreeting,
  aiSystemPrompt,
  isEnabled,
  onGreetingChange,
  onSystemPromptChange,
  onEnabledChange,
}: AIConfigProps) => {
  const promptLength = aiSystemPrompt.length;
  const maxPromptLength = 4000;
  const promptUsagePercent = (promptLength / maxPromptLength) * 100;

  return (
    <div className="space-y-6">
      {/* AI Enable Toggle Card */}
      <Card className="border-2 border-dashed">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${isEnabled ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-muted'}`}>
                <Sparkles className={`h-6 w-6 ${isEnabled ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Respuestas con IA</h3>
                <p className="text-sm text-muted-foreground">
                  Usa Google AI (Gemini) para responder preguntas que no estén en el flujo
                </p>
              </div>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={onEnabledChange}
            />
          </div>

          {isEnabled && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1">
                <Zap className="h-3 w-3" />
                Gemini 2.0 Flash
              </Badge>
              <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                <CheckCircle2 className="h-3 w-3" />
                Tu API Key configurada
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {isEnabled && (
        <>
          {/* AI Greeting */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Saludo de IA
              </CardTitle>
              <CardDescription>
                Primer mensaje cuando la IA responde por primera vez
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={aiGreeting}
                onChange={(e) => onGreetingChange(e.target.value)}
                placeholder="¡Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?"
                rows={2}
              />
            </CardContent>
          </Card>

          {/* System Prompt */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Prompt del Sistema
                  </CardTitle>
                  <CardDescription>
                    Define la personalidad, conocimientos y comportamiento de la IA
                  </CardDescription>
                </div>
                <Badge 
                  variant="outline"
                  className={promptUsagePercent > 80 ? 'text-amber-600 border-amber-200' : ''}
                >
                  {promptLength}/{maxPromptLength}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={aiSystemPrompt}
                onChange={(e) => onSystemPromptChange(e.target.value)}
                placeholder="Eres un asistente amable y profesional..."
                rows={8}
                maxLength={maxPromptLength}
              />

              {/* Progress bar */}
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    promptUsagePercent > 80 
                      ? 'bg-amber-500' 
                      : promptUsagePercent > 50 
                        ? 'bg-blue-500' 
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${promptUsagePercent}%` }}
                />
              </div>

              {/* Tips */}
              <div className="p-4 bg-gradient-to-r from-violet-500/5 to-purple-500/5 rounded-lg border border-violet-200/50">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  💡 Tips para un buen prompt
                </h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-violet-500">•</span>
                    <span><strong>Rol claro:</strong> "Eres el asistente de ventas de [empresa]"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-500">•</span>
                    <span><strong>Productos/servicios:</strong> Lista lo que ofreces con precios</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-500">•</span>
                    <span><strong>Tono:</strong> Define si es formal, casual, amigable</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-500">•</span>
                    <span><strong>Límites:</strong> Qué NO debe responder o hacer</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-500">•</span>
                    <span><strong>Escalación:</strong> Cuándo transferir a humano</span>
                  </li>
                </ul>
              </div>

              {/* Example prompt */}
              <details className="group">
                <summary className="cursor-pointer text-sm text-primary font-medium hover:underline">
                  Ver ejemplo de prompt efectivo
                </summary>
                <div className="mt-3 p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap">
{`Eres el asistente virtual de "TechStore", una tienda de tecnología.

INFORMACIÓN DE LA EMPRESA:
- Horario: Lunes a Viernes 9am-6pm
- Teléfono: +57 300 123 4567
- Dirección: Calle 123 #45-67, Bogotá

PRODUCTOS PRINCIPALES:
- iPhone 15: $4,500,000 COP
- MacBook Air M2: $5,200,000 COP
- AirPods Pro: $890,000 COP

REGLAS:
- Responde siempre en español
- Sé amable y profesional
- NO des información sobre competidores
- Si preguntan por garantías, menciona que son de 1 año
- Si el cliente está enojado, ofrece hablar con un humano`}
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Cost Info */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800">Control de costos</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Estás usando tu propia API key de Google AI. El nivel gratuito incluye 
                    ~1,500 solicitudes/día. Después se cobra según uso.
                  </p>
                  <a 
                    href="https://aistudio.google.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-amber-600 underline mt-2 inline-block"
                  >
                    Ver uso en Google AI Studio →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
