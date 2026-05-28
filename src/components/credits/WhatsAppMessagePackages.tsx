import { useState } from 'react';
import { MessageSquare, Sparkles, Zap, Building2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCredits } from '@/hooks/useCredits';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const iconForSize = (n: number) => {
  if (n >= 25000) return Building2;
  if (n >= 10000) return Zap;
  if (n >= 5000) return Sparkles;
  return MessageSquare;
};

export const WhatsAppMessagePackages = () => {
  const { packages, loading, purchaseCredits } = useCredits();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const waPackages = packages.filter((p) => p.package_type === 'whatsapp_messages');

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
      console.error('Error creating package checkout:', err);
      toast.error('No se pudo iniciar el pago. Intenta de nuevo.');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
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

  if (waPackages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No hay paquetes de mensajes disponibles por ahora.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Paquetes de mensajes WhatsApp</h3>
        <p className="text-sm text-muted-foreground">
          Aumenta tu cupo mensual de mensajes enviados. Los mensajes se suman al mes en curso.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {waPackages.map((pkg) => {
          const Icon = iconForSize(pkg.extra_messages ?? 0);
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
                    {(pkg.extra_messages ?? 0).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground ml-1">mensajes</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    ${pkg.price_cop.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">COP</p>
                  {pkg.price_usd && (
                    <p className="text-xs text-muted-foreground">≈ ${pkg.price_usd} USD</p>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>+{(pkg.extra_messages ?? 0).toLocaleString()} mensajes extra este mes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Se suma a tu plan actual</span>
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
    </div>
  );
};