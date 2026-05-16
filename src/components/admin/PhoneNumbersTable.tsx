import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, ArrowRightLeft, Search, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PhoneRow {
  id: string;
  phone: string;
  connection_type: string | null;
  local_active: boolean;
  user_id: string;
  user_name: string | null;
  user_email: string;
  user_active: boolean;
  plan: string | null;
  current_period_end: string | null;
  days_expired: number;
  meta_status: string | null;
  meta_quality: string | null;
  meta_name_status: string | null;
  meta_error: string | null;
}

interface UserOption {
  user_id: string;
  full_name: string | null;
  email: string;
  plan: string | null;
  active: boolean;
}

const statusBadge = (s: string | null) => {
  if (!s) return <Badge variant="outline">—</Badge>;
  const up = s.toUpperCase();
  if (up === 'CONNECTED') return <Badge className="bg-green-500/15 text-green-700 border border-green-500/30">Activo</Badge>;
  if (up === 'DISCONNECTED') return <Badge variant="secondary">Desconectado</Badge>;
  if (up === 'RESTRICTED' || up === 'FLAGGED') return <Badge className="bg-yellow-500/15 text-yellow-700 border border-yellow-500/30">Restringido</Badge>;
  if (up === 'BANNED' || up === 'BLOCKED' || up === 'LOCKED') return <Badge variant="destructive">Bloqueado</Badge>;
  if (up === 'ERROR') return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">{up}</Badge>;
};

export const PhoneNumbersTable = () => {
  const [rows, setRows] = useState<PhoneRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'connected' | 'restricted' | 'blocked' | 'disconnected' | 'error' | 'active_paid' | 'active_expired'>('all');

  // Reassign dialog
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PhoneRow | null>(null);
  const [newUserId, setNewUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: accounts }, { data: profiles }, { data: subs }, { data: authData }] = await Promise.all([
        supabase.from('whatsapp_accounts').select('id, phone_number, user_id, is_active, connection_type'),
        supabase.from('profiles').select('user_id, full_name'),
        supabase.from('subscriptions').select('user_id, plan, status, current_period_end'),
        supabase.functions.invoke('admin-get-users'),
      ]);

      const emailMap = new Map<string, string>();
      (authData?.data?.users || authData?.users || []).forEach((u: { id: string; email: string }) => emailMap.set(u.id, u.email));
      const profileMap = new Map<string, string | null>();
      (profiles || []).forEach((p) => profileMap.set(p.user_id, p.full_name));
      const subMap = new Map<string, { plan: string; active: boolean; current_period_end: string | null }>();
      (subs || []).forEach((s) => {
        const active = s.status === 'active' && (!s.current_period_end || new Date(s.current_period_end) > new Date());
        subMap.set(s.user_id, { plan: s.plan, active, current_period_end: s.current_period_end });
      });

      const userOptions: UserOption[] = (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: emailMap.get(p.user_id) || 'N/A',
        plan: subMap.get(p.user_id)?.plan || null,
        active: subMap.get(p.user_id)?.active || false,
      }));
      setUsers(userOptions);

      const baseRows: PhoneRow[] = (accounts || []).map((a) => {
        const sub = subMap.get(a.user_id);
        const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
        const daysExpired = periodEnd && periodEnd < new Date()
          ? Math.ceil((new Date().getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return {
          id: a.id,
          phone: a.phone_number,
          connection_type: a.connection_type,
          local_active: a.is_active,
          user_id: a.user_id,
          user_name: profileMap.get(a.user_id) || null,
          user_email: emailMap.get(a.user_id) || 'N/A',
          user_active: sub?.active || false,
          plan: sub?.plan || null,
          current_period_end: sub?.current_period_end || null,
          days_expired: daysExpired,
          meta_status: null,
          meta_quality: null,
          meta_name_status: null,
          meta_error: null,
        };
      });

      setRows(baseRows);

      // Fetch meta statuses
      try {
        const { data: meta } = await supabase.functions.invoke('admin-wa-meta-status');
        const map = new Map<string, { status: string; quality: string | null; name_status: string | null; error: string | null }>();
        (meta?.results || []).forEach((r: { id: string; status: string; quality: string | null; name_status: string | null; error: string | null }) => {
          map.set(r.id, { status: r.status, quality: r.quality, name_status: r.name_status, error: r.error });
        });
        setRows((prev) =>
          prev.map((r) => {
            const m = map.get(r.id);
            return m ? { ...r, meta_status: m.status, meta_quality: m.quality, meta_name_status: m.name_status, meta_error: m.error } : r;
          }),
        );
      } catch (e) {
        console.error('meta status', e);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar números');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshMeta = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast.success('Estado actualizado');
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const hay = `${r.phone} ${r.user_email} ${r.user_name || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (filterStatus !== 'all') {
        const s = (r.meta_status || '').toUpperCase();
        if (filterStatus === 'connected' && s !== 'CONNECTED') return false;
        if (filterStatus === 'restricted' && !['RESTRICTED', 'FLAGGED'].includes(s)) return false;
        if (filterStatus === 'blocked' && !['BANNED', 'BLOCKED', 'LOCKED'].includes(s)) return false;
        if (filterStatus === 'disconnected' && s !== 'DISCONNECTED') return false;
        if (filterStatus === 'error' && s !== 'ERROR') return false;
        if (filterStatus === 'active_paid' && !r.user_active) return false;
        if (filterStatus === 'active_expired' && (r.user_active || r.days_expired === 0)) return false;
      }
      return true;
    });
  }, [rows, search, filterStatus]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    const list = term
      ? users.filter((u) => `${u.email} ${u.full_name || ''}`.toLowerCase().includes(term))
      : users;
    return list.slice(0, 200);
  }, [users, userSearch]);

  const openReassign = (row: PhoneRow) => {
    setTarget(row);
    setNewUserId('');
    setUserSearch('');
    setOpen(true);
  };

  const submitReassign = async () => {
    if (!target || !newUserId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reassign-whatsapp', {
        body: { whatsapp_account_id: target.id, new_user_id: newUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Número reasignado');
      setOpen(false);
      load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Error reasignando');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            <div>
              <CardTitle>Números de WhatsApp</CardTitle>
              <CardDescription>Estado en Meta, usuario asignado y reasignación</CardDescription>
            </div>
          </div>
          <Button onClick={refreshMeta} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refrescar Meta
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar número, usuario o email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="connected">Activos Meta</SelectItem>
              <SelectItem value="active_paid">Al día</SelectItem>
              <SelectItem value="active_expired">Plan vencido</SelectItem>
              <SelectItem value="restricted">Restringidos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
              <SelectItem value="disconnected">Desconectados</SelectItem>
              <SelectItem value="error">Con error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {filtered.length} de {rows.length} números
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado Meta</TableHead>
                  <TableHead>Calidad</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Días vencido</TableHead>
                  <TableHead>Estado usuario</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.phone}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.connection_type === 'external' ? 'WuzAPI' : 'Meta'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {statusBadge(r.meta_status)}
                        {r.meta_error && (
                          <span className="text-xs text-destructive truncate max-w-[180px]" title={r.meta_error}>
                            {r.meta_error}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.meta_quality || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{r.user_name || '—'}</span>
                        <span className="text-xs text-muted-foreground">{r.user_email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.plan || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.current_period_end
                        ? format(new Date(r.current_period_end), 'dd MMM yyyy', { locale: es })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {r.days_expired > 0 ? (
                        <Badge variant="destructive">{r.days_expired} días</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.user_active ? (
                        <Badge className="bg-green-500/15 text-green-700 border border-green-500/30">Al día</Badge>
                      ) : (
                        <Badge variant="destructive">Sin plan</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openReassign(r)}>
                        <ArrowRightLeft className="h-4 w-4 mr-1" />
                        Reasignar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No hay números que coincidan
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Reasignar número</DialogTitle>
              <DialogDescription>
                {target ? `Número ${target.phone} actualmente de ${target.user_email}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Buscar usuario destino</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Email o nombre"
                    className="pl-9"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
                {filteredUsers.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setNewUserId(u.user_id)}
                    className={`w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between ${
                      newUserId === u.user_id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{u.full_name || '—'}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{u.plan || 'sin plan'}</span>
                      {u.active ? (
                        <Badge className="bg-green-500/15 text-green-700 border border-green-500/30">Activo</Badge>
                      ) : (
                        <Badge variant="outline">Inactivo</Badge>
                      )}
                    </div>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4">Sin resultados</div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button onClick={submitReassign} disabled={!newUserId || submitting}>
                {submitting ? 'Reasignando…' : 'Confirmar reasignación'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
