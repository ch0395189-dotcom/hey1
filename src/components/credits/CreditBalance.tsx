import { Coins, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useCredits } from '@/hooks/useCredits';
import { Skeleton } from '@/components/ui/skeleton';

export const CreditBalance = () => {
  const { credits, loading } = useCredits();

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="p-4">
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Coins className="h-4 w-4" />
              Créditos Disponibles
            </p>
            <p className="text-3xl font-bold text-primary">
              {credits?.balance.toLocaleString() || 0}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-1 justify-end">
              <TrendingUp className="h-3 w-3 text-green-500" />
              Comprados: {credits?.total_purchased.toLocaleString() || 0}
            </p>
            <p className="flex items-center gap-1 justify-end">
              <TrendingDown className="h-3 w-3 text-orange-500" />
              Usados: {credits?.total_consumed.toLocaleString() || 0}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
