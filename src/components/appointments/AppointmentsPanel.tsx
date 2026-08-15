import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { supabase } from '@/integrations/supabase/client';
import { getEffectiveUser } from '@/lib/effectiveAuth';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Check,
  X,
  Phone,
  Cake,
  Clock,
  Download,
  User as UserIcon,
  MessageSquare,
} from 'lucide-react';
import { AppointmentRemindersCard } from './AppointmentRemindersCard';

interface Appointment {
  id: string;
  conversation_id: string | null;
  user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  birth_date: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  confirmed: { label: 'Confirmada', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  completed: { label: 'Completada', className: 'bg-sky-500/15 text-sky-600 border-sky-500/30' },
  cancelled: { label: 'Cancelada', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const statusMeta = (s: string) =>
  STATUS_META[s] ?? { label: s, className: 'bg-muted text-muted-foreground border-border' };

export const AppointmentsPanel = () => {
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAdminCheck();
  const [owners, setOwners] = useState<Record<string, { name: string; email: string }>>({});
  const [convs, setConvs] = useState<Record<string, { phone: string; name: string | null }>>({});
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [infoAppt, setInfoAppt] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await getEffectiveUser();
    const uid = authData.user?.id ?? null;
    setMyUserId(uid);

    // Un agente de equipo debe ver las citas de la cuenta dueña
    let ownerId: string | null = null;
    try {
      const { data: owner } = await supabase.rpc('get_my_owner_id');
      ownerId = (owner as string | null) ?? null;
    } catch {
      ownerId = null;
    }

    let query = supabase
      .from('appointments')
      .select('id, conversation_id, user_id, customer_name, customer_phone, birth_date, appointment_date, appointment_time, notes, status, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    // Cada usuario ve solo las citas de su cuenta. El admin puede ampliar el alcance.
    if (uid && !(isAdmin && scope === 'all')) {
      const ids = Array.from(new Set([uid, ownerId].filter(Boolean) as string[]));
      query = ids.length > 1 ? query.in('user_id', ids) : query.eq('user_id', uid);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Error al cargar citas', description: error.message, variant: 'destructive' });
    } else {
      setAppointments((data ?? []) as Appointment[]);
    }
    setLoading(false);
  }, [isAdmin, scope]);

  // Cargar los datos del usuario dueño de cada cita
  const loadOwners = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const map: Record<string, { name: string; email: string }> = {};

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', ids);
    (profiles ?? []).forEach((p: any) => {
      map[p.user_id] = { name: p.full_name ?? '', email: '' };
    });

    if (isAdmin) {
      const { data } = await supabase.functions.invoke('admin-get-users');
      const users = (data?.users ?? data ?? []) as any[];
      users.forEach((u: any) => {
        if (!ids.includes(u.id)) return;
        map[u.id] = {
          name: map[u.id]?.name || u.user_metadata?.full_name || '',
          email: u.email ?? '',
        };
      });
    }

    setOwners(map);
  }, [isAdmin]);


  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ids = Array.from(new Set(appointments.map((a) => a.user_id).filter(Boolean) as string[]));
    loadOwners(ids);
  }, [appointments, loadOwners]);

  // Cargar el chat real (número/nombre de WhatsApp) vinculado a cada cita
  useEffect(() => {
    const ids = Array.from(
      new Set(appointments.map((a) => a.conversation_id).filter(Boolean) as string[]),
    );
    if (!ids.length) return;
    (async () => {
      const map: Record<string, { phone: string; name: string | null }> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from('conversations')
          .select('id, customer_phone, customer_name')
          .in('id', ids.slice(i, i + 200));
        (data ?? []).forEach((c: any) => {
          map[c.id] = { phone: c.customer_phone, name: c.customer_name };
        });
      }
      setConvs(map);
    })();
  }, [appointments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      if (status !== 'all' && a.status !== status) return false;
      if (isAdmin && scope === 'all' && ownerFilter !== 'all' && a.user_id !== ownerFilter) return false;
      if (q) {
        const c = a.conversation_id ? convs[a.conversation_id] : undefined;
        const hay = `${a.customer_name ?? ''} ${a.customer_phone ?? ''} ${a.notes ?? ''} ${
          c?.phone ?? ''
        } ${c?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const d = a.appointment_date ?? '';
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
  }, [appointments, search, status, from, to, convs, isAdmin, scope, ownerFilter]);


  const counts = useMemo(() => {
    const c: Record<string, number> = { all: appointments.length };
    appointments.forEach((a) => {
      c[a.status] = (c[a.status] ?? 0) + 1;
    });
    return c;
  }, [appointments]);

  const updateStatus = async (id: string, next: string) => {
    const { error } = await supabase.from('appointments').update({ status: next }).eq('id', id);
    if (error) {
      toast({ title: 'No se pudo actualizar', description: error.message, variant: 'destructive' });
      return;
    }
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
    toast({ title: 'Cita actualizada', description: statusMeta(next).label });
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('appointments').delete().eq('id', deleteId);
    if (error) {
      toast({ title: 'No se pudo eliminar', description: error.message, variant: 'destructive' });
    } else {
      setAppointments((prev) => prev.filter((a) => a.id !== deleteId));
      toast({ title: 'Cita eliminada' });
    }
    setDeleteId(null);
  };

  const openConversation = (a: Appointment) => {
    if (!a.conversation_id) {
      toast({
        title: 'Sin conversación vinculada',
        description: 'Esta cita no tiene un chat de WhatsApp asociado.',
      });
      return;
    }
    if (window.location.pathname !== '/dashboard') {
      navigate(`/dashboard?view=inbox&platform=whatsapp&conv=${a.conversation_id}`);
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'inbox');
      next.set('platform', 'whatsapp');
      next.set('conv', a.conversation_id as string);
      return next;
    });
  };

  const exportCsv = () => {
    const rows = [
      ['Nombre', 'Teléfono (escrito)', 'WhatsApp del chat', 'Nacimiento', 'Fecha', 'Hora', 'Estado', 'Notas', 'Agendada por', 'Creada'],
      ...filtered.map((a) => [
        a.customer_name ?? '',
        a.customer_phone ?? '',
        (a.conversation_id && convs[a.conversation_id]?.phone) || '',
        a.birth_date ?? '',
        a.appointment_date ?? '',
        a.appointment_time ?? '',
        statusMeta(a.status).label,
        (a.notes ?? '').replace(/[\r\n]+/g, ' '),
        a.user_id ? (owners[a.user_id]?.email || owners[a.user_id]?.name || a.user_id) : '',
        new Date(a.created_at).toLocaleString('es-CO'),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `citas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o nota…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ({counts.all ?? 0})</SelectItem>
            <SelectItem value="pending">Pendientes ({counts.pending ?? 0})</SelectItem>
            <SelectItem value="confirmed">Confirmadas ({counts.confirmed ?? 0})</SelectItem>
            <SelectItem value="completed">Completadas ({counts.completed ?? 0})</SelectItem>
            <SelectItem value="cancelled">Canceladas ({counts.cancelled ?? 0})</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <span className="text-muted-foreground text-sm">a</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Select value={scope} onValueChange={(v) => { setScope(v as 'mine' | 'all'); setOwnerFilter('all'); }}>
              <SelectTrigger className="w-full lg:w-52">
                <SelectValue placeholder="Alcance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Solo mi cuenta</SelectItem>
                <SelectItem value="all">Todas las cuentas (admin)</SelectItem>
              </SelectContent>
            </Select>
            {scope === 'all' && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-full lg:w-56">
                  <SelectValue placeholder="Agendada por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los usuarios</SelectItem>
                  {Array.from(new Set(appointments.map((a) => a.user_id).filter(Boolean) as string[])).map((id) => (
                    <SelectItem key={id} value={id}>
                      {owners[id]?.name || owners[id]?.email || id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={load} title="Actualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={exportCsv} title="Exportar CSV" disabled={!filtered.length}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>


      <AppointmentRemindersCard />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mb-3 opacity-50" />
          <p className="font-medium">No hay citas para mostrar</p>
          <p className="text-sm">Las citas agendadas por el chatbot aparecerán aquí.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => {
            const meta = statusMeta(a.status);
            return (
              <Card
                key={a.id}
                onClick={() => openConversation(a)}
                className={a.conversation_id ? 'cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40' : ''}
                title={a.conversation_id ? 'Abrir conversación de WhatsApp' : undefined}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{a.customer_name || 'Sin nombre'}</p>
                      {a.customer_phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <Phone className="h-3 w-3" /> {a.customer_phone}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                  </div>

                  {a.conversation_id ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-2 text-xs">
                      <span className="flex items-center gap-1.5 min-w-0 w-full">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">
                          Chat:{' '}
                          <span className="font-medium text-foreground">
                            {convs[a.conversation_id]?.phone
                              ? `+${convs[a.conversation_id].phone}`
                              : 'cargando…'}
                          </span>
                          {convs[a.conversation_id]?.name ? ` · ${convs[a.conversation_id]?.name}` : ''}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        className="h-9 w-full sm:h-7 sm:w-auto px-3 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          openConversation(a);
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5 sm:hidden" />
                        Enviar mensaje
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                      Sin chat de WhatsApp vinculado
                    </div>
                  )}

                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      {a.appointment_date || 'Sin fecha'}
                      {a.appointment_time && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {a.appointment_time}
                        </span>
                      )}
                    </p>
                    {a.birth_date && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Cake className="h-4 w-4" /> {a.birth_date}
                      </p>
                    )}
                    {a.notes && <p className="text-muted-foreground line-clamp-2">{a.notes}</p>}
                  </div>

                  {a.user_id && (
                    <div
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="flex items-center gap-1.5 min-w-0 text-muted-foreground">
                        <UserIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          Agendada por:{' '}
                          <span className="text-foreground font-medium">
                            {owners[a.user_id]?.name || owners[a.user_id]?.email || 'Cuenta sin nombre'}
                          </span>
                          {owners[a.user_id]?.email && owners[a.user_id]?.name
                            ? ` · ${owners[a.user_id].email}`
                            : ''}
                        </span>
                      </span>
                      {isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 shrink-0"
                          onClick={() =>
                            navigate(
                              `/admin?tab=users&q=${encodeURIComponent(
                                owners[a.user_id!]?.email || owners[a.user_id!]?.name || '',
                              )}`,
                            )
                          }
                        >
                          Ver usuario
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 shrink-0"
                          onClick={() => setInfoAppt(a)}
                        >
                          Ver quién agendó
                        </Button>
                      )}
                    </div>
                  )}


                  <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    {a.status !== 'confirmed' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, 'confirmed')}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Confirmar
                      </Button>
                    )}
                    {a.status !== 'completed' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, 'completed')}>
                        Completar
                      </Button>
                    )}
                    {a.status !== 'cancelled' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, 'cancelled')}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(a.id)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Creada el {new Date(a.created_at).toLocaleString('es-CO')}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cita?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
