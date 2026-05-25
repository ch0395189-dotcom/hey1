import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCw, Search, Send, MailWarning } from 'lucide-react';

interface Row {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string | null;
  plan: string | null;
  status: string | null;
}

export const NoWhatsAppOutreach = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: subs }, { data: accounts }, { data: authData }] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, created_at'),
        supabase.from('subscriptions').select('user_id, plan, status'),
        supabase.from('whatsapp_accounts').select('user_id'),
        supabase.functions.invoke('admin-get-users'),
      ]);

      const withWa = new Set((accounts || []).map((a) => a.user_id));
      const emailMap = new Map<string, string>();
      const list = (authData?.data?.users || authData?.users || []) as { id: string; email?: string }[];
      list.forEach((u) => { if (u.id && u.email) emailMap.set(u.id, u.email); });

      const subMap = new Map<string, { plan: string; status: string }>();
      (subs || []).forEach((s) => subMap.set(s.user_id, { plan: s.plan, status: s.status }));

      const built: Row[] = (profiles || [])
        .filter((p) => !withWa.has(p.user_id))
        .map((p) => ({
          user_id: p.user_id,
          email: emailMap.get(p.user_id) || '',
          full_name: p.full_name,
          created_at: p.created_at,
          plan: subMap.get(p.user_id)?.plan || null,
          status: subMap.get(p.user_id)?.status || null,
        }))
        .filter((r) => r.email);

      built.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      setRows(built);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => `${r.email} ${r.full_name || ''}`.toLowerCase().includes(t));
  }, [rows, search]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.user_id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((r) => next.delete(r.user_id));
    else filtered.forEach((r) => next.add(r.user_id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const sendTo = async (ids: string[]) => {
    if (ids.length === 0) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-installation-offer', {
        body: { userIds: ids },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Enviados: ${data?.sent?.length || 0} · Errores: ${data?.errors?.length || 0}`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <MailWarning className="h-5 w-5" />
            <div>
              <CardTitle>Usuarios sin número de WhatsApp</CardTitle>
              <CardDescription>Ofréceles servicio de instalación asistida por correo</CardDescription>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => sendTo(Array.from(selected))}
              disabled={sending || selected.size === 0}
              size="sm"
            >
              <Send className="h-4 w-4 mr-2" />
              Enviar a seleccionados ({selected.size})
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
              placeholder="Buscar correo o nombre"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          {filtered.length} usuarios sin número (de {rows.length})
        </div>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Registrado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.user_id)}
                        onCheckedChange={() => toggleOne(r.user_id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{r.email}</TableCell>
                    <TableCell className="text-sm">{r.full_name || '—'}</TableCell>
                    <TableCell className="text-xs">{r.plan || '—'}</TableCell>
                    <TableCell>
                      {r.status === 'trialing' ? (
                        <Badge className="bg-blue-500/15 text-blue-700 border border-blue-500/30">En prueba</Badge>
                      ) : r.status === 'active' ? (
                        <Badge className="bg-green-500/15 text-green-700 border border-green-500/30">Activo</Badge>
                      ) : (
                        <Badge variant="outline">{r.status || '—'}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={sending} onClick={() => sendTo([r.user_id])}>
                        <Send className="h-4 w-4 mr-1" />
                        Enviar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay usuarios sin número
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