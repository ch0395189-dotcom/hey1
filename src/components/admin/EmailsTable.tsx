import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCw, Search, Mail, Copy, Download } from 'lucide-react';

interface EmailRow {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  active: boolean;
  whatsapp_count: number;
  phones: string[];
}

export const EmailsTable = () => {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'trialing' | 'no_wa'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: subs }, { data: accounts }, { data: authData }] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, created_at'),
        supabase.from('subscriptions').select('user_id, plan, status, current_period_end'),
        supabase.from('whatsapp_accounts').select('user_id, phone_number, is_active'),
        supabase.functions.invoke('admin-get-users'),
      ]);

      const emailMap = new Map<string, string>();
      const list = (authData?.data?.users || authData?.users || []) as { id: string; email?: string }[];
      list.forEach((u) => { if (u.id && u.email) emailMap.set(u.id, u.email); });

      const subMap = new Map<string, { plan: string; status: string; current_period_end: string | null; active: boolean }>();
      (subs || []).forEach((s) => {
        const active = s.status === 'active' && (!s.current_period_end || new Date(s.current_period_end) > new Date());
        subMap.set(s.user_id, { plan: s.plan, status: s.status, current_period_end: s.current_period_end, active });
      });

      const waMap = new Map<string, string[]>();
      (accounts || []).forEach((a) => {
        if (!a.is_active) return;
        const arr = waMap.get(a.user_id) || [];
        arr.push(a.phone_number);
        waMap.set(a.user_id, arr);
      });

      const built: EmailRow[] = (profiles || []).map((p) => {
        const sub = subMap.get(p.user_id);
        const phones = waMap.get(p.user_id) || [];
        return {
          user_id: p.user_id,
          email: emailMap.get(p.user_id) || 'N/A',
          full_name: p.full_name,
          created_at: p.created_at,
          plan: sub?.plan || null,
          status: sub?.status || null,
          current_period_end: sub?.current_period_end || null,
          active: sub?.active || false,
          whatsapp_count: phones.length,
          phones,
        };
      });

      built.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setRows(built);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar correos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const hay = `${r.email} ${r.full_name || ''} ${r.phones.join(' ')}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (filterStatus === 'active' && !r.active) return false;
      if (filterStatus === 'expired' && r.active) return false;
      if (filterStatus === 'trialing' && r.status !== 'trialing') return false;
      if (filterStatus === 'no_wa' && r.whatsapp_count > 0) return false;
      return true;
    });
  }, [rows, search, filterStatus]);

  const copyAllEmails = async () => {
    const emails = filtered.map((r) => r.email).filter((e) => e && e !== 'N/A').join(', ');
    if (!emails) {
      toast.info('Sin correos para copiar');
      return;
    }
    try {
      await navigator.clipboard.writeText(emails);
      toast.success(`${filtered.length} correos copiados`);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const exportCsv = () => {
    const header = ['email', 'nombre', 'plan', 'estado_suscripcion', 'al_dia', 'vence', 'whatsapp', 'numeros', 'registrado'];
    const lines = [header.join(',')];
    filtered.forEach((r) => {
      const row = [
        r.email,
        (r.full_name || '').replace(/[",\n]/g, ' '),
        r.plan || '',
        r.status || '',
        r.active ? 'si' : 'no',
        r.current_period_end ? new Date(r.current_period_end).toISOString().slice(0, 10) : '',
        String(r.whatsapp_count),
        r.phones.join(' | '),
        r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `correos-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (r: EmailRow) => {
    if (r.status === 'trialing') {
      return <Badge className="bg-blue-500/15 text-blue-700 border border-blue-500/30">En prueba</Badge>;
    }
    if (r.active) {
      return <Badge className="bg-green-500/15 text-green-700 border border-green-500/30">Al día</Badge>;
    }
    if (r.status === 'canceled') return <Badge variant="destructive">Cancelado</Badge>;
    return <Badge variant="destructive">Vencido</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <div>
              <CardTitle>Correos de clientes</CardTitle>
              <CardDescription>Lista completa de correos con su plan y estado</CardDescription>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={copyAllEmails} variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Copiar correos
            </Button>
            <Button onClick={exportCsv} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            <Button onClick={load} disabled={loading} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar correo, nombre o número"
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
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Al día</SelectItem>
              <SelectItem value="trialing">En prueba</SelectItem>
              <SelectItem value="expired">Vencidos</SelectItem>
              <SelectItem value="no_wa">Sin WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {filtered.length} de {rows.length} clientes
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Registrado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="text-sm">{r.email}</TableCell>
                    <TableCell className="text-sm">{r.full_name || '—'}</TableCell>
                    <TableCell className="text-xs">{r.plan || '—'}</TableCell>
                    <TableCell>{statusBadge(r)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.current_period_end ? format(new Date(r.current_period_end), 'dd MMM yyyy', { locale: es }) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.whatsapp_count === 0 ? (
                        <Badge variant="outline">Sin número</Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {r.phones.slice(0, 2).map((p) => (
                            <span key={p} className="font-mono text-xs">{p}</span>
                          ))}
                          {r.phones.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{r.phones.length - 2} más</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(r.email);
                            toast.success('Correo copiado');
                          } catch {
                            toast.error('No se pudo copiar');
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No hay correos que coincidan
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
