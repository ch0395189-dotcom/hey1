import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCw, Search, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface BoldPayment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  plan: string | null;
  bold_transaction_id: string | null;
  event_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SubRow {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  updated_at: string;
}

type Health = 'ok' | 'pending' | 'error';

interface Row extends BoldPayment {
  email: string;
  full_name: string | null;
  sub_plan: string | null;
  sub_status: string | null;
  sub_period_end: string | null;
  sub_updated_at: string | null;
  health: Health;
  health_reason: string;
}

const PLAN_LABELS: Record<string, string> = {
  professional: 'Professional',
  enterprise: 'Enterprise',
  esoterico_pro: 'Nichos Difíciles',
  esoterico_rental: 'Nichos + Alquiler',
  emprendedor: 'Emprendedor',
  starter: 'Starter',
};

const fmtMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: currency || 'COP', maximumFractionDigits: 0 }).format(amount);

const fmtDate = (iso: string | null) =>
  iso ? format(new Date(iso), "dd MMM yyyy HH:mm", { locale: es }) : '—';

const isFailedEvent = (eventType: string | null) => {
  const e = (eventType || '').toLowerCase();
  return e.includes('reject') || e.includes('fail') || e.includes('error') || e.includes('void') || e.includes('declin');
};

function computeHealth(p: BoldPayment, sub: SubRow | undefined): { health: Health; reason: string } {
  if (isFailedEvent(p.event_type)) {
    return { health: 'error', reason: `Bold reportó "${p.event_type}"` };
  }
  if (!sub) {
    return { health: 'error', reason: 'El usuario no tiene suscripción registrada' };
  }
  const activated = sub.status === 'active' && new Date(sub.updated_at).getTime() >= new Date(p.created_at).getTime() - 5 * 60 * 1000;
  if (activated) {
    if (p.plan && sub.plan !== p.plan) {
      return { health: 'error', reason: `Pagó ${PLAN_LABELS[p.plan] ?? p.plan} pero tiene ${PLAN_LABELS[sub.plan] ?? sub.plan}` };
    }
    if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
      return { health: 'error', reason: 'Suscripción activa pero el periodo ya venció' };
    }
    return { health: 'ok', reason: 'Suscripción activada tras el pago' };
  }
  const minutes = (Date.now() - new Date(p.created_at).getTime()) / 60000;
  if (sub.status === 'active') {
    return { health: 'ok', reason: 'Suscripción activa' };
  }
  if (minutes <= 15) {
    return { health: 'pending', reason: 'Esperando conciliación (máx. 15 min)' };
  }
  return { health: 'error', reason: `Pago recibido hace ${Math.round(minutes)} min y la suscripción sigue en "${sub.status}"` };
}

const HEALTH_META: Record<Health, { label: string; icon: typeof CheckCircle2; variant: 'default' | 'secondary' | 'destructive' }> = {
  ok: { label: 'Activada', icon: CheckCircle2, variant: 'default' },
  pending: { label: 'Pendiente', icon: Clock, variant: 'secondary' },
  error: { label: 'Error', icon: XCircle, variant: 'destructive' },
};

export const BoldPaymentsMonitor = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Health>('all');
  const [rangeDays, setRangeDays] = useState('7');
  const emailsRef = useRef<Record<string, { email: string; full_name: string | null }>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const since = new Date(Date.now() - Number(rangeDays) * 86400000).toISOString();
      const [payRes, subRes] = await Promise.all([
        supabase
          .from('bold_payments')
          .select('id, user_id, amount, currency, plan, bold_transaction_id, event_type, metadata, created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('subscriptions').select('user_id, plan, status, current_period_end, updated_at'),
      ]);

      if (payRes.error) throw payRes.error;
      if (subRes.error) throw subRes.error;

      const payments = (payRes.data || []) as BoldPayment[];
      const subMap = new Map<string, SubRow>();
      (subRes.data || []).forEach((s) => subMap.set(s.user_id, s as SubRow));

      if (Object.keys(emailsRef.current).length === 0) {
        const { data: usersData } = await supabase.functions.invoke('admin-get-users');
        const list = (usersData?.users || []) as Array<{ id: string; email?: string }>;
        const { data: profiles } = await supabase.from('profiles').select('user_id, full_name');
        const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
        const map: Record<string, { email: string; full_name: string | null }> = {};
        list.forEach((u) => {
          map[u.id] = { email: u.email || '—', full_name: nameMap.get(u.id) ?? null };
        });
        emailsRef.current = map;
      }

      const next: Row[] = payments.map((p) => {
        const sub = subMap.get(p.user_id);
        const { health, reason } = computeHealth(p, sub);
        const info = emailsRef.current[p.user_id];
        return {
          ...p,
          email: info?.email ?? '—',
          full_name: info?.full_name ?? null,
          sub_plan: sub?.plan ?? null,
          sub_status: sub?.status ?? null,
          sub_period_end: sub?.current_period_end ?? null,
          sub_updated_at: sub?.updated_at ?? null,
          health,
          health_reason: reason,
        };
      });

      setRows(next);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error cargando pagos Bold:', err);
      if (!silent) toast.error('No se pudieron cargar los pagos de Bold');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  // Realtime: si las tablas están publicadas, refrescamos al instante
  useEffect(() => {
    const channel = supabase
      .channel('bold-payments-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bold_payments' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => load(true))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.health !== statusFilter) return false;
      if (!term) return true;
      return (
        r.email.toLowerCase().includes(term) ||
        (r.full_name || '').toLowerCase().includes(term) ||
        (r.bold_transaction_id || '').toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(() => ({
    ok: rows.filter((r) => r.health === 'ok').length,
    pending: rows.filter((r) => r.health === 'pending').length,
    error: rows.filter((r) => r.health === 'error').length,
  }), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(['ok', 'pending', 'error'] as Health[]).map((h) => {
          const meta = HEALTH_META[h];
          const Icon = meta.icon;
          return (
            <Card key={h}>
              <CardContent className="flex items-center gap-3 py-4">
                <Icon className={h === 'error' ? 'h-5 w-5 text-destructive' : 'h-5 w-5 text-muted-foreground'} />
                <div>
                  <p className="text-2xl font-bold">{counts[h]}</p>
                  <p className="text-xs text-muted-foreground">{meta.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Monitor de pagos Bold</CardTitle>
              <CardDescription>
                Estado de cada pago y su suscripción
                {lastUpdate && ` · actualizado ${format(lastUpdate, 'HH:mm:ss')}`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="auto-refresh-bold" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <Label htmlFor="auto-refresh-bold" className="text-xs">Auto</Label>
              </div>
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por email, nombre o transacción"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | Health)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ok">Activadas</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="error">Con error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rangeDays} onValueChange={setRangeDays}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último día</SelectItem>
                <SelectItem value="7">7 días</SelectItem>
                <SelectItem value="30">30 días</SelectItem>
                <SelectItem value="90">90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Plan pagado</TableHead>
                  <TableHead>Suscripción</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Diagnóstico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {loading ? 'Cargando…' : 'Sin pagos en este periodo'}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => {
                  const meta = HEALTH_META[r.health];
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <p className="font-medium truncate">{r.full_name || 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtMoney(r.amount, r.currency)}</TableCell>
                      <TableCell>{r.plan ? (PLAN_LABELS[r.plan] ?? r.plan) : '—'}</TableCell>
                      <TableCell>
                        <p className="text-sm">{r.sub_plan ? (PLAN_LABELS[r.sub_plan] ?? r.sub_plan) : '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.sub_status ?? 'sin suscripción'}
                          {r.sub_period_end ? ` · hasta ${fmtDate(r.sub_period_end)}` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fmtDate(r.created_at)}
                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {r.event_type || 'sin evento'}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <span className={`text-xs flex items-start gap-1 ${r.health === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {r.health === 'error' && <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                          {r.health_reason}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};