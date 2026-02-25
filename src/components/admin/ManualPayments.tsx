import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, CreditCard, Search, RefreshCw, Download, FileSpreadsheet } from 'lucide-react';

interface UnifiedPayment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  date: string;
  source: 'manual' | 'alert' | 'bold';
  status: string;
}

interface UserOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

export const ManualPayments = () => {
  const [payments, setPayments] = useState<UnifiedPayment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAllPayments = async () => {
    setLoading(true);
    try {
      const [manualRes, alertsRes] = await Promise.all([
        supabase
          .from('manual_payments')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_alerts')
          .select('*')
          .eq('status', 'paid')
          .order('paid_at', { ascending: false }),
      ]);

      const unified: UnifiedPayment[] = [];

      // Manual payments
      if (manualRes.data) {
        manualRes.data.forEach(p => {
          unified.push({
            id: p.id,
            user_id: p.user_id,
            amount: p.amount,
            currency: p.currency,
            payment_method: p.payment_method,
            reference: p.reference,
            notes: p.notes,
            date: p.created_at,
            source: 'manual',
            status: 'paid',
          });
        });
      }

      // Paid alerts (confirmed by admin or webhook)
      if (alertsRes.data) {
        alertsRes.data.forEach(a => {
          // Avoid duplicating if a manual payment already exists for same user/amount/time
          unified.push({
            id: a.id,
            user_id: a.user_id,
            amount: a.amount,
            currency: a.currency,
            payment_method: null,
            reference: null,
            notes: a.message,
            date: a.paid_at || a.sent_at,
            source: 'alert',
            status: 'paid',
          });
        });
      }

      // Sort by date descending
      unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPayments(unified);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Error al cargar pagos');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      if (profilesError) throw profilesError;

      const { data: authData } = await supabase.functions.invoke('admin-get-users');
      
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: { id: string; email: string }) => {
          emailMap.set(u.id, u.email);
        });
      }

      const usersWithEmails = profiles?.map(profile => ({
        user_id: profile.user_id,
        full_name: profile.full_name,
        email: emailMap.get(profile.user_id) || 'N/A',
      })) || [];

      setUsers(usersWithEmails);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  useEffect(() => {
    fetchAllPayments();
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId || !amount) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { error } = await supabase
        .from('manual_payments')
        .insert({
          user_id: selectedUserId,
          admin_id: session.user.id,
          amount: parseInt(amount),
          currency: 'COP',
          payment_method: paymentMethod || null,
          reference: reference || null,
          notes: notes || null,
        });

      if (error) throw error;

      // Activate subscription for 30 days
      const { error: subError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('user_id', selectedUserId);

      if (subError) throw subError;

      // Clear pending alerts
      await supabase
        .from('payment_alerts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('user_id', selectedUserId)
        .eq('status', 'pending');

      toast.success('Pago registrado y suscripción activada');
      setDialogOpen(false);
      resetForm();
      fetchAllPayments();
    } catch (error) {
      console.error('Error creating payment:', error);
      toast.error('Error al registrar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedUserId('');
    setAmount('');
    setPaymentMethod('');
    setReference('');
    setNotes('');
  };

  const getUserDisplay = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    return user ? (user.full_name || user.email) : userId;
  };

  const getUserEmail = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    return user?.email || '';
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'manual': return 'Manual';
      case 'alert': return 'Alerta Pagada';
      case 'bold': return 'Bold';
      default: return source;
    }
  };

  const getSourceVariant = (source: string): 'default' | 'secondary' | 'outline' => {
    switch (source) {
      case 'manual': return 'default';
      case 'alert': return 'secondary';
      case 'bold': return 'outline';
      default: return 'outline';
    }
  };

  const filteredPayments = payments.filter(payment => {
    const user = users.find(u => u.user_id === payment.user_id);
    const searchLower = searchTerm.toLowerCase();
    return (
      user?.full_name?.toLowerCase().includes(searchLower) ||
      user?.email.toLowerCase().includes(searchLower) ||
      payment.reference?.toLowerCase().includes(searchLower) ||
      payment.notes?.toLowerCase().includes(searchLower)
    );
  });

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

  const exportToCSV = () => {
    if (filteredPayments.length === 0) {
      toast.error('No hay pagos para exportar');
      return;
    }

    const headers = ['Fecha', 'Usuario', 'Email', 'Monto (COP)', 'Método', 'Referencia', 'Origen', 'Notas'];
    const rows = filteredPayments.map(p => [
      format(new Date(p.date), 'yyyy-MM-dd HH:mm'),
      getUserDisplay(p.user_id),
      getUserEmail(p.user_id),
      p.amount.toString(),
      p.payment_method || '',
      p.reference || '',
      getSourceLabel(p.source),
      (p.notes || '').replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      '',
      `"Total","","","${totalAmount}","","","",""`,
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pagos_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Archivo exportado correctamente');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <CardTitle>Historial de Pagos</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportToCSV} disabled={filteredPayments.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Pago
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Pago Manual</DialogTitle>
                  <DialogDescription>
                    Registra un pago realizado fuera de la plataforma. Esto activará automáticamente la suscripción por 30 días.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="user">Usuario *</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un usuario" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.user_id} value={user.user_id}>
                            {user.full_name || 'Sin nombre'} - {user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">Monto (COP) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="50000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="method">Método de Pago</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                        <SelectItem value="nequi">Nequi</SelectItem>
                        <SelectItem value="daviplata">Daviplata</SelectItem>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reference">Referencia</Label>
                    <Input
                      id="reference"
                      placeholder="Número de transacción..."
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      placeholder="Notas adicionales..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Registrando...' : 'Registrar Pago'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>
          Todos los pagos registrados — manuales, alertas confirmadas y pagos en línea
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuario, referencia o notas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={fetchAllPayments} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <div className="ml-auto text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{filteredPayments.length}</span> pagos · Total: <span className="font-semibold text-primary">{formatAmount(totalAmount)}</span>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Cargando pagos...
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay pagos registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((payment) => (
                    <TableRow key={`${payment.source}-${payment.id}`}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(payment.date), 'dd MMM yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getUserDisplay(payment.user_id)}
                      </TableCell>
                      <TableCell className="font-semibold text-primary whitespace-nowrap">
                        {formatAmount(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.payment_method || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.reference || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSourceVariant(payment.source)}>
                          {getSourceLabel(payment.source)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {payment.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
