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
import { Plus, CreditCard, Search, RefreshCw, FileSpreadsheet, CalendarIcon, X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface UnifiedPayment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  date: string;
  source: 'manual' | 'alert' | 'bold' | 'credit';
  status: 'approved' | 'pending' | 'rejected';
}

interface UserOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

type StatusFilter = 'all' | 'approved' | 'pending' | 'rejected';

export const ManualPayments = () => {
  const [payments, setPayments] = useState<UnifiedPayment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAllPayments = async () => {
    setLoading(true);
    try {
      const [manualRes, alertsRes, boldRes, creditRes] = await Promise.all([
        supabase
          .from('manual_payments')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_alerts')
          .select('*')
          .order('sent_at', { ascending: false }),
        supabase
          .from('bold_payments' as any)
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('credit_purchases')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      const unified: UnifiedPayment[] = [];

      // Manual payments — always approved
      if (manualRes.data) {
        manualRes.data.forEach((p: any) => {
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
            status: 'approved',
          });
        });
      }

      // Payment alerts — map status
      if (alertsRes.data) {
        alertsRes.data.forEach((a: any) => {
          const isPaid = a.status === 'paid';
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
            status: isPaid ? 'approved' : 'pending',
          });
        });
      }

      // Bold payments — map event_type
      if (boldRes.data) {
        (boldRes.data as any[]).forEach((b: any) => {
          const isCompleted = b.event_type === 'completed';
          unified.push({
            id: b.id,
            user_id: b.user_id,
            amount: b.amount,
            currency: b.currency || 'COP',
            payment_method: 'Bold',
            reference: b.bold_transaction_id,
            notes: b.plan ? `Plan: ${b.plan}` : null,
            date: b.created_at,
            source: 'bold',
            status: isCompleted ? 'approved' : 'pending',
          });
        });
      }

      // Credit purchases — map status
      if (creditRes.data) {
        (creditRes.data as any[]).forEach((c: any) => {
          let status: 'approved' | 'pending' | 'rejected' = 'pending';
          if (c.status === 'completed') status = 'approved';
          else if (c.status === 'failed') status = 'rejected';

          unified.push({
            id: c.id,
            user_id: c.user_id,
            amount: c.amount,
            currency: c.currency || 'COP',
            payment_method: c.payment_method || 'Créditos',
            reference: c.payment_reference,
            notes: `Créditos: ${c.credits}`,
            date: c.created_at,
            source: 'credit',
            status,
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

      // Activate subscription for 30 days (and update plan if selected)
      const subUpdate: Record<string, unknown> = {
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      if (selectedPlan) subUpdate.plan = selectedPlan;

      const { error: subError } = await supabase
        .from('subscriptions')
        .update(subUpdate)
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
    setSelectedPlan('');
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
      case 'alert': return 'Alerta';
      case 'bold': return 'Bold';
      case 'credit': return 'Créditos';
      default: return source;
    }
  };

  const getSourceVariant = (source: string): 'default' | 'secondary' | 'outline' => {
    switch (source) {
      case 'manual': return 'default';
      case 'alert': return 'secondary';
      case 'bold': return 'outline';
      case 'credit': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Aprobado</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendiente</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rechazado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredPayments = payments.filter(payment => {
    const user = users.find(u => u.user_id === payment.user_id);
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      user?.full_name?.toLowerCase().includes(searchLower) ||
      user?.email.toLowerCase().includes(searchLower) ||
      payment.reference?.toLowerCase().includes(searchLower) ||
      payment.notes?.toLowerCase().includes(searchLower)
    );

    const paymentDate = new Date(payment.date);
    const fromStart = dateFrom ? new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate()) : null;
    const toEnd = dateTo ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999) : null;
    const matchesDateFrom = !fromStart || paymentDate >= fromStart;
    const matchesDateTo = !toEnd || paymentDate <= toEnd;

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesStatus;
  });

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  const approvedCount = payments.filter(p => p.status === 'approved').length;
  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const rejectedCount = payments.filter(p => p.status === 'rejected').length;

  const exportToCSV = () => {
    if (filteredPayments.length === 0) {
      toast.error('No hay pagos para exportar');
      return;
    }

    const headers = ['Fecha', 'Usuario', 'Email', 'Monto (COP)', 'Método', 'Referencia', 'Origen', 'Estado', 'Notas'];
    const rows = filteredPayments.map(p => [
      format(new Date(p.date), 'yyyy-MM-dd HH:mm'),
      getUserDisplay(p.user_id),
      getUserEmail(p.user_id),
      p.amount.toString(),
      p.payment_method || '',
      p.reference || '',
      getSourceLabel(p.source),
      p.status === 'approved' ? 'Aprobado' : p.status === 'pending' ? 'Pendiente' : 'Rechazado',
      (p.notes || '').replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      '',
      `"Total","","","${totalAmount}","","","","",""`,
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

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'approved', label: `Aprobados (${approvedCount})` },
    { value: 'pending', label: `Pendientes (${pendingCount})` },
    { value: 'rejected', label: `Rechazados (${rejectedCount})` },
  ];

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
                    <Label htmlFor="plan">Plan a asignar</Label>
                    <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                      <SelectTrigger>
                        <SelectValue placeholder="Mantener plan actual" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                        <SelectItem value="esoterico_pro">Nichos Difíciles</SelectItem>
                        <SelectItem value="esoterico_rental">Nichos Difíciles + Alquiler</SelectItem>
                      </SelectContent>
                    </Select>
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
          Todos los pagos registrados — manuales, alertas, Bold y compras de créditos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('approved')}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                statusFilter === 'approved'
                  ? "bg-green-100 text-green-700 border-green-200"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Aprobados: {approvedCount}
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                statusFilter === 'pending'
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Pendientes: {pendingCount}
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                statusFilter === 'rejected'
                  ? "bg-red-100 text-red-700 border-red-200"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Rechazados: {rejectedCount}
            </button>
            {statusFilter !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')} className="h-8">
                <X className="h-3 w-3 mr-1" />
                Limpiar filtro
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuario, referencia o notas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("min-w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Desde'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("min-w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Hasta'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="icon" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                <X className="h-4 w-4" />
              </Button>
            )}

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
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Cargando pagos...
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
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
