import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
  Calendar,
  Unlink,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { AppointmentRemindersCard } from './AppointmentRemindersCard';

interface Appointment {
  id: string;
  conversation_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  birth_date: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  google_sync_status: string | null;
  google_sync_error: string | null;
  google_event_link: string | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  confirmed: { label: 'Confirmada', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  completed: { label: 'Completada', className: 'bg-sky-500/15 text-sky-600 border-sky-500/30' },
  cancelled: { label: 'Cancelada', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

interface GoogleStatus {
  state: 'loading' | 'connected' | 'disconnected' | 'error';
  email?: string;
  message?: string;
  hint?: string;
  errorCode?: string;
  requiresReconnect?: boolean;
  retryable?: boolean;
}

const statusMeta = (s: string) =>
  STATUS_META[s] ?? { label: s, className: 'bg-muted text-muted-foreground border-border' };

export const AppointmentsPanel = () => {
  const [, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({
    state: 'loading',
  });
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('id, conversation_id, customer_name, customer_phone, birth_date, appointment_date, appointment_time, notes, status, created_at, google_sync_status, google_sync_error, google_event_link')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      toast({ title: 'Error al cargar citas', description: error.message, variant: 'destructive' });
    } else {
      setAppointments((data ?? []) as Appointment[]);
    }
    setLoading(false);
  }, []);

  const checkGoogleStatus = useCallback(async () => {
    setGoogleStatus({ state: 'loading' });
    const { data, error } = await supabase.functions.invoke('google-calendar-status');

    if (error) {
      console.error('google-calendar-status error:', error);
      setGoogleStatus({
        state: 'error',
        message: 'No pudimos verificar la conexión con Google Calendar.',
        hint: 'Revisa tu conexión a internet y vuelve a intentarlo.',
        retryable: true,
      });
      return;
    }

    if (data?.connected) {
      setGoogleStatus({ state: 'connected', email: data.email });
      return;
    }

    setGoogleStatus({
      state: data?.state === 'error' ? 'error' : 'disconnected',
      message: data?.message,
      hint: data?.hint,
      errorCode: data?.error_code,
      requiresReconnect: data?.requires_reconnect,
      retryable: data?.retryable,
    });
  }, []);

  const connectGoogleCalendar = async () => {
    setConnecting(true);
    try {
      const popup = window.open('', 'lovable-oauth', 'width=600,height=720');
      if (!popup) {
        toast({ title: 'Permite ventanas emergentes', variant: 'destructive' });
        return;
      }

      const completion = new Promise<void>((resolve, reject) => {
        let poll: number | undefined;
        const cleanup = () => {
          window.removeEventListener('message', onMessage);
          if (poll !== undefined) window.clearInterval(poll);
        };
        const onMessage = (event: MessageEvent) => {
          const type = event.data?.type;
          if (
            event.origin !== window.location.origin ||
            event.source !== popup ||
            event.data?.connectorId !== 'google_calendar' ||
            (type !== 'appUserConnectorOAuthComplete' && type !== 'appUserConnectorOAuthFailed')
          ) return;
          cleanup();
          if (type === 'appUserConnectorOAuthComplete') {
            resolve();
            return;
          }
          popup.close();
          reject(new Error(event.data?.reason ?? 'OAuth connection failed.'));
        };
        window.addEventListener('message', onMessage);
        poll = window.setInterval(() => {
          if (!popup.closed) return;
          cleanup();
          reject(new Error('La ventana de OAuth se cerró antes de terminar.'));
        }, 500);
      });

      const { data, error } = await supabase.functions.invoke('app-user-oauth-start', {
        body: { origin: window.location.origin },
      });
      if (error) throw error;

      popup.location.href = data.authorizationUrl;
      await completion;
      toast({ title: 'Google Calendar conectado' });
      await checkGoogleStatus();
    } catch (err: any) {
      toast({ title: 'Error al conectar', description: err.message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const disconnectGoogleCalendar = async () => {
    try {
      const { error } = await supabase.functions.invoke('google-calendar-disconnect');
      if (error) throw error;
      toast({ title: 'Google Calendar desconectado' });
      await checkGoogleStatus();
    } catch (err: any) {
      toast({ title: 'Error al desconectar', description: err.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    load();
    checkGoogleStatus();
  }, [load, checkGoogleStatus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      if (status !== 'all' && a.status !== status) return false;
      if (q) {
        const hay = `${a.customer_name ?? ''} ${a.customer_phone ?? ''} ${a.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const d = a.appointment_date ?? '';
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
  }, [appointments, search, status, from, to]);

  const googleConnMeta = useMemo(() => {
    switch (googleStatus.state) {
      case 'connected':
        return { label: 'Conectado', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
      case 'error':
        return { label: 'Con error', className: 'bg-destructive/15 text-destructive border-destructive/30' };
      case 'loading':
        return { label: 'Verificando…', className: 'bg-muted text-muted-foreground border-border' };
      default:
        return { label: 'No conectado', className: 'bg-muted text-muted-foreground border-border' };
    }
  }, [googleStatus.state]);

  const syncErrorCount = useMemo(
    () => appointments.filter((a) => a.google_sync_status === 'error').length,
    [appointments],
  );

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
    void 0;
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

  const exportCsv = () => {
    const rows = [
      ['Nombre', 'Teléfono', 'Nacimiento', 'Fecha', 'Hora', 'Estado', 'Notas', 'Creada'],
      ...filtered.map((a) => [
        a.customer_name ?? '',
        a.customer_phone ?? '',
        a.birth_date ?? '',
        a.appointment_date ?? '',
        a.appointment_time ?? '',
        statusMeta(a.status).label,
        (a.notes ?? '').replace(/[\r\n]+/g, ' '),
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={load} title="Actualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={exportCsv} title="Exportar CSV" disabled={!filtered.length}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Google Calendar connection */}
      <div
        className={`rounded-lg border p-3 space-y-2 ${
          googleStatus.state === 'error'
            ? 'border-destructive/40 bg-destructive/5'
            : googleStatus.state === 'connected'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'bg-muted/30'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {googleStatus.state === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            ) : googleStatus.state === 'connected' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <Calendar className="h-5 w-5 text-primary shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Google Calendar</p>
                <Badge variant="outline" className={googleConnMeta.className}>
                  {googleConnMeta.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {googleStatus.state === 'loading'
                  ? 'Verificando conexión…'
                  : googleStatus.state === 'connected'
                  ? `Conectado${googleStatus.email ? `: ${googleStatus.email}` : ''}. Se verifica disponibilidad y se crean los eventos automáticamente.`
                  : googleStatus.message ??
                    'No conectado. Las citas se guardarán solo en HeyHey.'}
              </p>
              {googleStatus.state !== 'connected' && googleStatus.hint && (
                <p className="text-xs text-muted-foreground/80 mt-0.5">{googleStatus.hint}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {googleStatus.state === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Button variant="ghost" size="icon" onClick={checkGoogleStatus} title="Reintentar verificación">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {googleStatus.state === 'connected' ? (
                  <Button variant="outline" size="sm" onClick={disconnectGoogleCalendar} disabled={connecting}>
                    <Unlink className="h-4 w-4 mr-1" /> Desconectar
                  </Button>
                ) : (
                  <Button
                    variant={googleStatus.state === 'error' ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={connectGoogleCalendar}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Calendar className="h-4 w-4 mr-1" />
                    )}
                    {googleStatus.state === 'error' ? 'Reconectar' : 'Conectar'}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {syncErrorCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {syncErrorCount} cita{syncErrorCount === 1 ? '' : 's'} no se pudo sincronizar con Google Calendar.
              Revisa el detalle en cada tarjeta; la cita sigue guardada en HeyHey.
            </span>
          </div>
        )}
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
              <Card key={a.id}>
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

                  {a.google_sync_status === 'error' ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium">No se sincronizó con Google Calendar</p>
                        <p className="text-destructive/80 break-words">
                          {a.google_sync_error || 'Error desconocido al crear el evento.'}
                        </p>
                      </div>
                    </div>
                  ) : a.google_event_link ? (
                    <a
                      href={a.google_event_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sincronizada en Google Calendar
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
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
