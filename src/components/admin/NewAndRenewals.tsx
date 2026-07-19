import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCw, Search, Download, UserPlus, Repeat } from 'lucide-react';
import { toast } from 'sonner';

interface AuthUser { id: string; email?: string; last_sign_in_at?: string | null }
interface Profile { user_id: string; full_name: string | null; created_at: string }
interface Subscription { user_id: string; plan: string; status: string; current_period_end: string | null; created_at: string; updated_at: string }
interface Payment { user_id: string; amount: number; created_at: string; source: 'bold' | 'manual'; plan?: string | null }

type NewUserRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  plan: string | null;
  status: string | null;
  payments_count: number;
};

type RenewalRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  plan: string | null;
  status: string | null;
  payments_count: number;
  total_amount: number;
  first_payment: string;
  last_payment: string;
};

const NEW_WINDOW_DAYS: Record<string, number> = { '7': 7, '30': 30, '60': 60, '90': 90 };

export const NewAndRenewals = () => {
  const [loading, setLoading] = useState(true);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');
  const [windowDays, setWindowDays] = useState<string>('30');

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: usersData, error: usersErr }, profRes, subRes, boldRes, manRes] = await Promise.all([
        supabase.functions.invoke('admin-get-users'),
        supabase.from('profiles').select('user_id, full_name, created_at'),
        supabase.from('subscriptions').select('user_id, plan, status, current_period_end, created_at, updated_at'),
        supabase.from('bold_payments').select('user_id, amount, created_at, plan'),
        supabase.from('manual_payments').select('user_id, amount, created_at'),
      ]);
      if (usersErr) throw usersErr;
      setAuthUsers((usersData as any)?.users ?? []);
      setProfiles((profRes.data ?? []) as Profile[]);
      setSubs((subRes.data ?? []) as Subscription[]);
      const bold: Payment[] = ((boldRes.data ?? []) as any[]).map((p) => ({ ...p, source: 'bold' }));
      const manual: Payment[] = ((manRes.data ?? []) as any[]).map((p) => ({ ...p, source: 'manual', plan: null }));
      setPayments([...bold, ...manual]);
    } catch (e: any) {
      console.error(e);
      toast.error('Error cargando datos: ' + (e?.message ?? 'desconocido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const emailById = useMemo(() => {
    const m = new Map<string, string>();
    authUsers.forEach((u) => u.email && m.set(u.id, u.email));
    return m;
  }, [authUsers]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const subById = useMemo(() => {
    const m = new Map<string, Subscription>();
    subs.forEach((s) => m.set(s.user_id, s));
    return m;
  }, [subs]);

  const paymentsByUser = useMemo(() => {
    const m = new Map<string, Payment[]>();
    payments.forEach((p) => {
      const arr = m.get(p.user_id) ?? [];
      arr.push(p);
      m.set(p.user_id, arr);
    });
    // sort each user's payments asc
    for (const arr of m.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return m;
  }, [payments]);

  // NEW USERS: registered within the selected window
  const newUsers = useMemo<NewUserRow[]>(() => {
    const days = NEW_WINDOW_DAYS[windowDays] ?? 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows: NewUserRow[] = [];
    for (const p of profiles) {
      const created = new Date(p.created_at).getTime();
      if (created < since) continue;
      const email = emailById.get(p.user_id) ?? '';
      if (!email) continue;
      const sub = subById.get(p.user_id);
      const pays = paymentsByUser.get(p.user_id) ?? [];
      rows.push({
        user_id: p.user_id,
        email,
        full_name: p.full_name,
        created_at: p.created_at,
        plan: sub?.plan ?? null,
        status: sub?.status ?? null,
        payments_count: pays.length,
      });
    }
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows;
  }, [profiles, emailById, subById, paymentsByUser, windowDays]);

  // RENEWALS: users with 2+ payments (bold+manual)
  const renewals = useMemo<RenewalRow[]>(() => {
    const rows: RenewalRow[] = [];
    for (const [userId, pays] of paymentsByUser.entries()) {
      if (pays.length < 2) continue;
      const email = emailById.get(userId) ?? '';
      if (!email) continue;
      const sub = subById.get(userId);
      const prof = profileById.get(userId);
      rows.push({
        user_id: userId,
        email,
        full_name: prof?.full_name ?? null,
        plan: sub?.plan ?? null,
        status: sub?.status ?? null,
        payments_count: pays.length,
        total_amount: pays.reduce((sum, p) => sum + (p.amount ?? 0), 0),
        first_payment: pays[0].created_at,
        last_payment: pays[pays.length - 1].created_at,
      });
    }
    rows.sort((a, b) => b.last_payment.localeCompare(a.last_payment));
    return rows;
  }, [paymentsByUser, emailById, subById, profileById]);

  const filter = (text: string) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return text.toLowerCase().includes(q);
  };

  const filteredNew = newUsers.filter((r) => filter(`${r.email} ${r.full_name ?? ''}`));
  const filteredRen = renewals.filter((r) => filter(`${r.email} ${r.full_name ?? ''}`));

  const exportCsv = (rows: any[], filename: string) => {
    if (rows.length === 0) { toast.info('No hay filas para exportar'); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  const statusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline">—</Badge>;
    const variant = status === 'active' ? 'default' : status === 'trialing' ? 'secondary' : 'outline';
    return <Badge variant={variant as any}>{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>Usuarios Nuevos y Renovaciones</CardTitle>
            <CardDescription>Registros recientes y clientes que vienen renovando el servicio</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por email o nombre..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>

        <Tabs defaultValue="new">
          <TabsList>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Nuevos ({filteredNew.length})
            </TabsTrigger>
            <TabsTrigger value="renewals" className="flex items-center gap-2">
              <Repeat className="h-4 w-4" /> Renovaciones ({filteredRen.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm text-muted-foreground">Registrados en los últimos:</span>
              <Select value={windowDays} onValueChange={setWindowDays}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 días</SelectItem>
                  <SelectItem value="30">30 días</SelectItem>
                  <SelectItem value="60">60 días</SelectItem>
                  <SelectItem value="90">90 días</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => exportCsv(filteredNew, 'usuarios_nuevos.csv')}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV
              </Button>
            </div>

            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Registrado</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Pagos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : filteredNew.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin usuarios nuevos en el periodo</TableCell></TableRow>
                  ) : filteredNew.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm">{format(new Date(r.created_at), 'dd MMM yyyy', { locale: es })}</div>
                        <div className="text-xs text-muted-foreground">hace {formatDistanceToNow(new Date(r.created_at), { locale: es })}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.email}</TableCell>
                      <TableCell>{r.full_name ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{r.plan ?? '—'}</Badge></TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">{r.payments_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="renewals" className="mt-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {filteredRen.length} clientes con 2+ pagos registrados
              </span>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => exportCsv(filteredRen, 'renovaciones.csv')}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV
              </Button>
            </div>

            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Pagos</TableHead>
                    <TableHead className="text-right">Total pagado</TableHead>
                    <TableHead>Primer pago</TableHead>
                    <TableHead>Último pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : filteredRen.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aún no hay clientes con renovaciones</TableCell></TableRow>
                  ) : filteredRen.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-mono text-xs">{r.email}</TableCell>
                      <TableCell>{r.full_name ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{r.plan ?? '—'}</Badge></TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{r.payments_count}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtCOP(r.total_amount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{format(new Date(r.first_payment), 'dd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <div>{format(new Date(r.last_payment), 'dd MMM yyyy', { locale: es })}</div>
                        <div className="text-xs text-muted-foreground">hace {formatDistanceToNow(new Date(r.last_payment), { locale: es })}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};