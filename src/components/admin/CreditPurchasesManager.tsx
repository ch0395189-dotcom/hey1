import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CreditPurchase {
  id: string;
  user_id: string;
  credits: number;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  payment_reference: string | null;
  user_email?: string;
}

export const CreditPurchasesManager = () => {
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchPurchases = async () => {
    setLoading(true);
    
    // First get purchases
    const { data: purchaseData, error } = await supabase
      .from('credit_purchases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching purchases:', error);
      toast.error('Error al cargar compras');
      setLoading(false);
      return;
    }

    // Get user emails from profiles
    const userIds = [...new Set(purchaseData?.map(p => p.user_id) || [])];
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      setPurchases(purchaseData?.map(p => ({
        ...p,
        user_email: profileMap.get(p.user_id) || p.user_id.substring(0, 8)
      })) || []);
    } else {
      setPurchases(purchaseData || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPurchases();
  }, []);

  const handleApprove = async (purchase: CreditPurchase) => {
    setProcessing(purchase.id);
    
    try {
      // Call the add_credits function using RPC
      const { error: creditsError } = await supabase.rpc('add_credits', {
        p_user_id: purchase.user_id,
        p_credits: purchase.credits
      });

      if (creditsError) throw creditsError;

      // Update purchase status
      const { error: updateError } = await supabase
        .from('credit_purchases')
        .update({ status: 'completed' })
        .eq('id', purchase.id);

      if (updateError) throw updateError;

      toast.success(`${purchase.credits} créditos agregados exitosamente`);
      fetchPurchases();
    } catch (error) {
      console.error('Error approving purchase:', error);
      toast.error('Error al aprobar la compra');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (purchaseId: string) => {
    setProcessing(purchaseId);
    
    try {
      const { error } = await supabase
        .from('credit_purchases')
        .update({ status: 'failed' })
        .eq('id', purchaseId);

      if (error) throw error;

      toast.success('Compra rechazada');
      fetchPurchases();
    } catch (error) {
      console.error('Error rejecting purchase:', error);
      toast.error('Error al rechazar la compra');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700">Completado</Badge>;
      case 'failed':
        return <Badge variant="destructive">Rechazado</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          <CardTitle>Compras de Créditos</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : purchases.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No hay compras registradas
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Créditos</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-medium">
                    {purchase.user_email}
                  </TableCell>
                  <TableCell>{purchase.credits.toLocaleString()}</TableCell>
                  <TableCell>
                    ${purchase.amount.toLocaleString()} {purchase.currency}
                  </TableCell>
                  <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                  <TableCell>
                    {format(new Date(purchase.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell className="text-right">
                    {purchase.status === 'pending' && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600"
                          onClick={() => handleApprove(purchase)}
                          disabled={processing === purchase.id}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => handleReject(purchase.id)}
                          disabled={processing === purchase.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Rechazar
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
