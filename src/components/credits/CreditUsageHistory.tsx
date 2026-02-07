import { Bot, Mic, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCredits } from '@/hooks/useCredits';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const serviceIcons = {
  ai_message: Bot,
  voice_minute: Mic,
  voice_agent: Phone,
};

const serviceLabels = {
  ai_message: 'Mensaje IA',
  voice_minute: 'Voz TTS',
  voice_agent: 'Agente de Voz',
};

export const CreditUsageHistory = () => {
  const { usage, loading } = useCredits();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (usage.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial de Uso</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Aún no has usado créditos. ¡Empieza a usar los servicios de IA y voz!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Historial de Uso</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {usage.map((item) => {
            const Icon = serviceIcons[item.service_type as keyof typeof serviceIcons] || Bot;
            const label = serviceLabels[item.service_type as keyof typeof serviceLabels] || item.service_type;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-sm text-destructive">
                    -{item.credits_used}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(item.created_at), 'dd MMM, HH:mm', { locale: es })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
