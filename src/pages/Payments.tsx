import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, CalendarIcon, CreditCard, FileSpreadsheet, Search, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface UnifiedPayment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  plan: string | null;
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
type PlanFilter = 'all' | 'professional' | 'enterprise' | 'esoterico_pro' | 'esoterico_rental' | 'none';

const PLAN_LABELS: Record<string, string> = {
  professional: 'Professional',
  enterprise: 'Enterprise',
  esoterico_pro: 'Nichos Difíciles',
  esoterico_rental: 'Nichos + Alquiler',
};

const Payments = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminCheck();

  const [payments, setPayments] = useState<UnifiedPayment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate('/dashboard');
  }, [isAdmin, adminLoading, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [manualRes, alertsRes, boldRes, creditRes, profilesRes, authRes] = await Promise.all([
        supabase.from('manual_payments').select('*').order('created_at', { ascending: false }),
        supabase.from('payment_alerts').select('*').order('sent_at', { ascending: false }),
        supabase.from('bold_payments' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('credit_purchases').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('user_id, full_name'),
        supabase.functions.invoke('admin-get-users'),
      ]);

      const emailMap = new Map<string, string>();
      const authUsers = (authRes.data as any)?.users || [];
      authUsers.forEach((u: { id: string; email: string }) => emailMap.set(u.id, u.email));

      const userOptions: UserOption[] = (profilesRes.data || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: emailMap.get(p.user_id) || 'N/A',
      }));
      setUsers(userOptions);

      const unified: UnifiedPayment[] = [];

      (manualRes.data || []).forEach((p: any) => {
        unified.push({
          id: p.id, user_id: p.user_id, amount: p.amount, currency: p.currency,
          payment_method: p.payment_method, reference: p.reference, notes: p.notes,
          plan: null, date: p.created_at, source: 'manual', status: 'approved',
        });
      });

      (alertsRes.data || []).forEach((a: any) => {
        unified.push({
          id: a.id, user_id: a.user_id, amount: a.amount, currency: a.currency,
          payment_method: null, reference: null, notes: a.message,
          plan: null, date: a.paid_at || a.sent_at, source: 'alert',
          status: a.status === 'paid' ? 'approved' : 'pending',
        });
      });

      ((boldRes.data as any[]) || []).forEach((b: any) => {
        unified.push({
          id: b.id, user_id: b.user_id, amount: b.amount, currency: b.currency || 'COP',
          payment_method: 'Bold', reference: b.bold_transaction_id,
          notes: b.plan ? `Plan: ${b.plan}` : null, plan: b.plan,
          date: b.created_at, source: 'bold',
          status: b.event_type === 'completed' ? 'approved' : 'pending',
        });
      });

      ((creditRes.data as any[]) || []).forEach((c: any) => {
        let status: 'approved' | 'pending' | 'rejected' = 'pending';
        if (c.status === 'completed') status = 'approved';
        else if (c.status === 'failed') status = 'rejected';
        unified.push({
          id: c.id, user_id: c.user_id, amount: c.amount, currency: c.currency || 'COP',
          payment_method: c.payment_method || 'Créditos', reference: c.payment_reference,
          notes: `Créditos: ${c.credits}`, plan: null,
          date: c.created_at, source: 'credit', status,
        });
      });

      unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPayments(unified);
    } catch (err) {
      console.error('Error loading payments', err);
      toast.error('Error al cargar pagos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const userById = useMemo(() => {
    const m = new Map<string, UserOption>();
    users.forEach(u => m.set(u.user_id, u));
    return m;
  }, [users]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate()) : null;
    const to = dateTo ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999) : null;

    return payments.filter(p => {
      const u = userById.get(p.user_id);
      if (term) {
        const haystack = `${u?.full_name || ''} ${u?.email || ''} ${p.reference || ''} ${p.user_id}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      const d = new Date(p.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (planFilter !== 'all') {
        if (planFilter === 'none') {
          if (p.plan) return false;
        } else if (p.plan !== planFilter) return false;
      }
      return true;
    });
  }, [payments, userById, searchTerm, dateFrom, dateTo, statusFilter, planFilter]);

  const totalAmount = filtered.reduce((s, p) => s + (p.status === 'approved' ? p.amount : 0), 0);
  const approvedCount = payments.filter(p => p.status === 'approved').length;
  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const rejectedCount = payments.filter(p => p.status === 'rejected').length;

  const formatAmount = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  const getStatusBadge = (s: string) => {
    if (s === 'approved') return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Aprobado</Badge>;
    if (s === 'pending') return <Badge variant="secondary">Pendiente</Badge>;
    if (s === 'rejected') return <Badge variant="destructive">Rechazado</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  const getSourceBadge = (src: string) => {
    const label = src === 'manual' ? 'Manual' : src === 'alert' ? 'Alerta' : src === 'bold' ? 'Bold' : 'Créditos';
    return <Badge variant="outline">{label}</Badge>;
  };

  const clearFilters = () => {
    setSearchTerm(''); setDateFrom(undefined); setDateTo(undefined);
    setStatusFilter('all'); setPlanFilter('all');
  };

  const exportCSV = () => {
    if (!filtered.length) { toast.error('No hay pagos para exportar'); return; }
    const headers = ['Fecha','Usuario','Email','Monto (COP)','Plan','Método','Referencia','Origen','Estado','Notas'];
    const rows = filtered.map(p => {
      const u = userById.get(p.user_id);
      return [
        format(new Date(p.date), 'yyyy-MM-dd HH:mm'),
        u?.full_name || '',
        u?.email || '',
        p.amount.toString(),
        p.plan ? (PLAN_LABELS[p.plan] || p.plan) : '',
        p.payment_method || '',
        p.reference || '',
        p.source,
        p.status,
        (p.notes || '').replace(/"/g, '""'),
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pagos_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Archivo exportado');
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const hasFilters = !!(searchTerm || dateFrom || dateTo || statusFilter !== 'all' || planFilter !== 'all');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              <h1 className="text-base sm:text-xl font-bold truncate">Pagos</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total aprobado (filtro)</div><div className="text-lg font-bold">{formatAmount(totalAmount)}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Aprobados</div><div className="text-lg font-bold text-green-600">{approvedCount}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Pendientes</div><div className="text-lg font-bold">{pendingCount}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Rechazados</div><div className="text-lg font-bold text-destructive">{rejectedCount}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>Filtra por fecha, estado, plan o busca por nombre / email.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario, email o referencia…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateFrom ? format(dateFrom, 'PPP', { locale: es }) : 'Desde'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateTo ? format(dateTo, 'PPP', { locale: es }) : 'Hasta'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="approved">Aprobados</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="rejected">Rechazados</SelectItem>
                </SelectContent>
              </Select>

              <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as PlanFilter)}>
                <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los planes</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                  <SelectItem value="esoterico_pro">Nichos Difíciles</SelectItem>
                  <SelectItem value="esoterico_rental">Nichos + Alquiler</SelectItem>
                  <SelectItem value="none">Sin plan (créditos/otros)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                Mostrando <strong>{filtered.length}</strong> de {payments.length} pagos
              </div>
              <div className="flex gap-2">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" /> Limpiar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Referencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin resultados</TableCell></TableRow>
                  ) : (
                    filtered.map(p => {
                      const u = userById.get(p.user_id);
                      return (
                        <TableRow key={`${p.source}-${p.id}`}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(p.date), 'dd MMM yyyy HH:mm', { locale: es })}
                          </TableCell>
                          <TableCell className="font-medium">{u?.full_name || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u?.email || '—'}</TableCell>
                          <TableCell className="text-right font-mono">{formatAmount(p.amount)}</TableCell>
                          <TableCell>{p.plan ? (PLAN_LABELS[p.plan] || p.plan) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>{getSourceBadge(p.source)}</TableCell>
                          <TableCell>{getStatusBadge(p.status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={p.reference || ''}>
                            {p.reference || '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Payments;