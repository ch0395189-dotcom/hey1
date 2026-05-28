import { useState } from 'react';
import { Coins, Sparkles, Zap, Building2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCredits, CREDIT_COSTS } from '@/hooks/useCredits';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const packageIcons = {
  'Básico': Coins,
  'Popular': Sparkles,
  'Pro': Zap,
  'Empresarial': Building2,
};

export const CreditPackages = () => {
  const { packages, loading } = useCredits();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const handlePurchase = async (packageId: string) => {
    setPurchasing(packageId);
    try {
      const successUrl = `${window.location.origin}/dashboard?payment=success`;
      const cancelUrl = `${window.location.origin}/dashboard?payment=cancelled`;
      const { data, error } = await supabase.functions.invoke('bold-checkout-package', {
        body: { packageId, successUrl, cancelUrl },
      });
      if (error) throw error;
      if (data?.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        throw new Error(data?.error || 'No se recibió URL de pago');
      }
    } catch (err) {
      console.error('Error creating checkout:', err);
      toast.error('No se pudo iniciar el pago. Intenta de nuevo.');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-32 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Paquetes de Créditos</h3>
        <p className="text-sm text-muted-foreground">
          Compra créditos para usar servicios de IA y voz
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {packages.filter((p) => (p.package_type ?? 'credits') === 'credits').map((pkg) => {
          const Icon = packageIcons[pkg.name as keyof typeof packageIcons] || Coins;
          const aiMessages = Math.floor(pkg.credits / CREDIT_COSTS.ai_message);
          const voiceMinutes = Math.floor(pkg.credits / CREDIT_COSTS.voice_minute);

          return (
            <Card 
              key={pkg.id} 
              className={`relative transition-all hover:shadow-lg ${
                pkg.is_popular ? 'border-primary ring-2 ring-primary/20' : ''
              }`}
            >
              {pkg.is_popular && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                  Más Popular
                </Badge>
              )}
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-2 p-3 rounded-full bg-primary/10 w-fit">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{pkg.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {pkg.credits.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground ml-1">créditos</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    ${pkg.price_cop.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">COP</p>
                  {pkg.price_usd && (
                    <p className="text-xs text-muted-foreground">
                      ≈ ${pkg.price_usd} USD
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>~{aiMessages} mensajes IA</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>~{voiceMinutes} min de voz</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant={pkg.is_popular ? 'default' : 'outline'}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing === pkg.id}
                >
                  {purchasing === pkg.id ? 'Procesando...' : 'Comprar'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <h4 className="font-medium mb-2">¿Cómo funcionan los créditos?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>Mensajes IA:</strong> {CREDIT_COSTS.ai_message} créditos por mensaje</li>
            <li>• <strong>Voz (TTS):</strong> {CREDIT_COSTS.voice_minute} créditos por minuto</li>
            <li>• <strong>Agente de Voz:</strong> {CREDIT_COSTS.voice_agent} créditos por minuto</li>
            <li>• Los créditos no expiran mientras tu cuenta esté activa</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
