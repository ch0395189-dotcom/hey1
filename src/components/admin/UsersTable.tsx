import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, X, Search, RefreshCw, Trash2, CalendarDays, Plus, CreditCard, Ban, ArrowRightLeft, Shield } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

interface UserWithSubscription {
  user_id: string;
  full_name: string | null;
  email: string;
  phone_number: string | null;
  subscription: {
    id: string;
    plan: string;
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
    current_period_start: string | null;
  } | null;
  created_at: string;
  platforms: string[];
  whatsapp_accounts: { id: string; phone_number: string; is_active: boolean; connection_type: string | null }[];
}

interface MetaStatus {
  id: string;
  phone: string;
  local_active: boolean;
  source: string;
  status: string;
  quality: string | null;
  name_status: string | null;
  error: string | null;
}

export const UsersTable = () => {
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Filters
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterWhatsapp, setFilterWhatsapp] = useState<'all' | 'with' | 'without'>('all');
  const [filterPlan, setFilterPlan] = useState<'all' | 'al_dia' | 'vencido' | 'trial'>('all');

  // Meta status map by whatsapp_account_id
  const [metaStatus, setMetaStatus] = useState<Record<string, MetaStatus>>({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Reassign dialog
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignAccount, setReassignAccount] = useState<{ id: string; phone: string; from_user: string } | null>(null);
  const [reassignTarget, setReassignTarget] = useState('');
  const [reassignSearch, setReassignSearch] = useState('');

  // Manage subscription dialog
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithSubscription | null>(null);
  const [addDays, setAddDays] = useState('30');
  const [renewalDate, setRenewalDate] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [userPendingAlerts, setUserPendingAlerts] = useState<{ id: string; amount: number; message: string | null; sent_at: string }[]>([]);
  const [manageMethod, setManageMethod] = useState('');
  const [manageAmount, setManageAmount] = useState('');

  // Manual charge dialog
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeMethod, setChargeMethod] = useState('');
  const [chargeReference, setChargeReference] = useState('');
  const [chargeNotes, setChargeNotes] = useState('');

  // Deactivate confirmation
  const [deactivateUser, setDeactivateUser] = useState<UserWithSubscription | null>(null);

  // Bulk delete (users without WhatsApp)
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBadConfirmOpen, setBulkBadConfirmOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, created_at');

      if (profilesError) throw profilesError;

      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('id, user_id, plan, status, trial_end, current_period_end, current_period_start');

      if (subsError) throw subsError;

      const { data: authData, error: authError } = await supabase.functions.invoke('admin-get-users');
      
      const emailMap = new Map<string, string>();
      if (!authError) {
        const list = (authData?.data?.users || authData?.users || []) as { id: string; email?: string }[];
        list.forEach((u) => {
          if (u.id && u.email) emailMap.set(u.id, u.email);
        });
      }

      const { data: waAccounts } = await supabase
        .from('whatsapp_accounts')
        .select('id, user_id, is_active, connection_type, phone_number');

      const { data: platAccounts } = await supabase
        .from('platform_accounts')
        .select('user_id, platform, is_active');

      const platformsMap = new Map<string, string[]>();
      const phoneMap = new Map<string, string>();
      const waByUser = new Map<string, { id: string; phone_number: string; is_active: boolean; connection_type: string | null }[]>();
      waAccounts?.forEach(wa => {
        if (wa.is_active) {
          const list = platformsMap.get(wa.user_id) || [];
          const label = wa.connection_type === 'external' ? 'WA External' : 'WhatsApp';
          if (!list.includes(label)) list.push(label);
          platformsMap.set(wa.user_id, list);
        }
        if (!phoneMap.has(wa.user_id) && wa.phone_number) {
          phoneMap.set(wa.user_id, wa.phone_number);
        }
        const arr = waByUser.get(wa.user_id) || [];
        arr.push({ id: wa.id, phone_number: wa.phone_number, is_active: wa.is_active, connection_type: wa.connection_type });
        waByUser.set(wa.user_id, arr);
      });
      platAccounts?.forEach(pa => {
        if (pa.is_active) {
          const list = platformsMap.get(pa.user_id) || [];
          const name = pa.platform.charAt(0).toUpperCase() + pa.platform.slice(1);
          if (!list.includes(name)) list.push(name);
          platformsMap.set(pa.user_id, list);
        }
      });

      const usersWithSubs = profiles?.map(profile => {
        const sub = subscriptions?.find(s => s.user_id === profile.user_id);
        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: emailMap.get(profile.user_id) || 'N/A',
          phone_number: phoneMap.get(profile.user_id) || null,
          subscription: sub ? {
            id: sub.id,
            plan: sub.plan,
            status: sub.status,
            trial_end: sub.trial_end,
            current_period_end: sub.current_period_end,
            current_period_start: sub.current_period_start,
          } : null,
          created_at: profile.created_at,
          platforms: platformsMap.get(profile.user_id) || [],
          whatsapp_accounts: waByUser.get(profile.user_id) || [],
        };
      }) || [];

      setUsers(usersWithSubs);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const refreshMetaStatus = async () => {
    setLoadingMeta(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-wa-meta-status');
      if (error) throw error;
      const map: Record<string, MetaStatus> = {};
      (data?.results || []).forEach((r: MetaStatus) => { map[r.id] = r; });
      setMetaStatus(map);
      toast.success('Estado Meta actualizado');
    } catch (e) {
      console.error(e);
      toast.error('Error consultando Meta');
    } finally {
      setLoadingMeta(false);
    }
  };

  const openReassign = (waId: string, phone: string, fromUser: string) => {
    setReassignAccount({ id: waId, phone, from_user: fromUser });
    setReassignTarget('');
    setReassignSearch('');
    setReassignOpen(true);
  };

  const handleReassign = async () => {
    if (!reassignAccount || !reassignTarget) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reassign-whatsapp', {
        body: { whatsapp_account_id: reassignAccount.id, new_user_id: reassignTarget },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Número reasignado correctamente');
      setReassignOpen(false);
      fetchUsers();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Error reasignando');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSubscription = async (
    userId: string, 
    field: 'plan' | 'status', 
    value: string
  ) => {
    try {
      const updateData: Record<string, unknown> = { [field]: value };
      
      if (field === 'status' && value === 'active') {
        updateData.current_period_start = new Date().toISOString();
        updateData.current_period_end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('user_id', userId);

      if (error) throw error;
      
      toast.success('Suscripción actualizada');
      fetchUsers();
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Error al actualizar suscripción');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    try {
      const { error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId },
      });
      if (error) throw error;
      toast.success(`Usuario "${userName}" eliminado correctamente`);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Error al eliminar usuario');
    }
  };

  const handleBulkDeleteWithoutWhatsApp = async () => {
    const targets = users.filter(u => {
      const hasWa = u.platforms.some(p => p === 'WhatsApp' || p === 'WA External');
      return !hasWa;
    });
    if (targets.length === 0) {
      toast.info('No hay usuarios sin WhatsApp para eliminar');
      setBulkConfirmOpen(false);
      return;
    }
    setBulkDeleting(true);
    let ok = 0, fail = 0;
    for (const u of targets) {
      try {
        const { error } = await supabase.functions.invoke('admin-delete-user', {
          body: { userId: u.user_id },
        });
        if (error) throw error;
        ok++;
      } catch (e) {
        console.error('Bulk delete error for', u.email, e);
        fail++;
      }
    }
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    toast.success(`Eliminados: ${ok}${fail ? ` · Fallidos: ${fail}` : ''}`);
    fetchUsers();
  };

  const isBadWaStatus = (s: string | null | undefined) => {
    if (!s) return false;
    const up = s.toUpperCase();
    return ['BANNED', 'BLOCKED', 'LOCKED', 'RESTRICTED', 'FLAGGED', 'ERROR'].includes(up);
  };

  const usersWithBadWhatsApp = () => users.filter(u => {
    if (u.whatsapp_accounts.length === 0) return false;
    // All accounts must be either inactive locally OR in a bad meta status
    return u.whatsapp_accounts.every(wa => {
      if (!wa.is_active) return true;
      const m = metaStatus[wa.id];
      return m && isBadWaStatus(m.status);
    });
  });

  const handleBulkDeleteBadWhatsApp = async () => {
    const targets = usersWithBadWhatsApp();
    if (targets.length === 0) {
      toast.info('No hay usuarios con WhatsApp en mal estado');
      setBulkBadConfirmOpen(false);
      return;
    }
    setBulkDeleting(true);
    let ok = 0, fail = 0;
    for (const u of targets) {
      try {
        const { error } = await supabase.functions.invoke('admin-delete-user', {
          body: { userId: u.user_id },
        });
        if (error) throw error;
        ok++;
      } catch (e) {
        console.error('Bulk delete bad-WA error for', u.email, e);
        fail++;
      }
    }
    setBulkDeleting(false);
    setBulkBadConfirmOpen(false);
    toast.success(`Eliminados: ${ok}${fail ? ` · Fallidos: ${fail}` : ''}`);
    fetchUsers();
  };

  const handleAddDays = async () => {
    if (!selectedUser || !addDays) return;
    if (!manageMethod) {
      toast.error('Selecciona el método de pago');
      return;
    }
    setSubmitting(true);
    try {
      const days = parseInt(addDays);
      const currentEnd = selectedUser.subscription?.current_period_end 
        ? new Date(selectedUser.subscription.current_period_end)
        : new Date();
      
      // If current end is in the past, start from now
      const baseDate = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: selectedUser.subscription?.current_period_start || new Date().toISOString(),
          current_period_end: newEnd.toISOString(),
        })
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;

      // Log payment method (and amount if provided) to manual_payments
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from('manual_payments').insert({
          user_id: selectedUser.user_id,
          admin_id: session.user.id,
          amount: manageAmount ? parseInt(manageAmount) : 0,
          currency: 'COP',
          payment_method: manageMethod,
          notes: `Activación manual: +${days} días`,
        });
      }

      toast.success(`Se agregaron ${days} días a ${selectedUser.full_name || selectedUser.email}`);
      setManageDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error adding days:', error);
      toast.error('Error al agregar días');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetRenewalDate = async () => {
    if (!selectedUser || !renewalDate) return;
    if (!manageMethod) {
      toast.error('Selecciona el método de pago');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: renewalDate.toISOString(),
        })
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from('manual_payments').insert({
          user_id: selectedUser.user_id,
          admin_id: session.user.id,
          amount: manageAmount ? parseInt(manageAmount) : 0,
          currency: 'COP',
          payment_method: manageMethod,
          notes: `Activación manual: fecha ${format(renewalDate, 'dd MMM yyyy', { locale: es })}`,
        });
      }

      toast.success(`Fecha de renovación actualizada para ${selectedUser.full_name || selectedUser.email}`);
      setManageDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error setting renewal date:', error);
      toast.error('Error al establecer fecha');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualCharge = async () => {
    if (!selectedUser || !chargeAmount) {
      toast.error('Completa los campos requeridos');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { error } = await supabase
        .from('manual_payments')
        .insert({
          user_id: selectedUser.user_id,
          admin_id: session.user.id,
          amount: parseInt(chargeAmount),
          currency: 'COP',
          payment_method: chargeMethod || null,
          reference: chargeReference || null,
          notes: chargeNotes || null,
        });

      if (error) throw error;

      // Activate subscription for 30 days
      const currentEnd = selectedUser.subscription?.current_period_end 
        ? new Date(selectedUser.subscription.current_period_end)
        : new Date();
      const baseDate = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: newEnd.toISOString(),
        })
        .eq('user_id', selectedUser.user_id);

      // Clear all pending payment alerts for this user
      await supabase
        .from('payment_alerts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('user_id', selectedUser.user_id)
        .eq('status', 'pending');

      toast.success(`Cobro registrado, suscripción activada y alertas eliminadas para ${selectedUser.full_name || selectedUser.email}`);
      setChargeDialogOpen(false);
      setChargeAmount('');
      setChargeMethod('');
      setChargeReference('');
      setChargeNotes('');
      fetchUsers();
    } catch (error) {
      console.error('Error creating manual charge:', error);
      toast.error('Error al registrar cobro');
    } finally {
      setSubmitting(false);
    }
  };

  const openManageDialog = async (user: UserWithSubscription) => {
    setSelectedUser(user);
    setAddDays('30');
    setRenewalDate(user.subscription?.current_period_end ? new Date(user.subscription.current_period_end) : undefined);
    setManageMethod('');
    setManageAmount('');
    setManageDialogOpen(true);

    // Fetch pending alerts for this user
    const { data } = await supabase
      .from('payment_alerts')
      .select('id, amount, message, sent_at')
      .eq('user_id', user.user_id)
      .eq('status', 'pending')
      .order('sent_at', { ascending: false });
    setUserPendingAlerts(data || []);
  };

  const handleMarkAlertPaid = async (alertId: string) => {
    if (!selectedUser) return;
    try {
      const { error } = await supabase
        .from('payment_alerts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;

      // Also add 30 days to subscription and activate
      const currentEnd = selectedUser.subscription?.current_period_end
        ? new Date(selectedUser.subscription.current_period_end)
        : new Date();
      const baseDate = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: newEnd.toISOString(),
        })
        .eq('user_id', selectedUser.user_id);

      setUserPendingAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success('Pago confirmado, suscripción activada por 30 días');
      fetchUsers();
    } catch (error) {
      console.error('Error marking alert as paid:', error);
      toast.error('Error al marcar como pagado');
    }
  };

  const handleDismissAllAlerts = async () => {
    if (!selectedUser || userPendingAlerts.length === 0) return;
    try {
      const { error } = await supabase
        .from('payment_alerts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('user_id', selectedUser.user_id)
        .eq('status', 'pending');
      if (error) throw error;

      // Add 30 days and activate subscription
      const currentEnd = selectedUser.subscription?.current_period_end
        ? new Date(selectedUser.subscription.current_period_end)
        : new Date();
      const baseDate = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: newEnd.toISOString(),
        })
        .eq('user_id', selectedUser.user_id);

      setUserPendingAlerts([]);
      toast.success('Todos los pagos confirmados, suscripción activada');
      fetchUsers();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar alertas');
    }
  };

  const openChargeDialog = (user: UserWithSubscription) => {
    setSelectedUser(user);
    setChargeAmount('');
    setChargeMethod('');
    setChargeReference('');
    setChargeNotes('');
    setChargeDialogOpen(true);
  };

  const handleDeactivate = async () => {
    if (!deactivateUser) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          current_period_end: new Date().toISOString(),
        })
        .eq('user_id', deactivateUser.user_id);
      if (error) throw error;
      toast.success(`Suscripción desactivada para ${deactivateUser.full_name || deactivateUser.email}`);
      setDeactivateUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deactivating:', error);
      toast.error('Error al desactivar suscripción');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      trialing: 'secondary',
      canceled: 'destructive',
      past_due: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const now = Date.now();
  const filteredUsers = users.filter(user => {
    const matchesSearch =
      !searchTerm ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone_number?.includes(searchTerm);
    if (!matchesSearch) return false;

    const status = user.subscription?.status;
    const isSubActive = status === 'active' || status === 'trialing';
    if (filterActive === 'active' && !isSubActive) return false;
    if (filterActive === 'inactive' && isSubActive) return false;

    const hasWa = user.platforms.some(p => p === 'WhatsApp' || p === 'WA External');
    if (filterWhatsapp === 'with' && !hasWa) return false;
    if (filterWhatsapp === 'without' && hasWa) return false;

    const periodEnd = user.subscription?.current_period_end
      ? new Date(user.subscription.current_period_end).getTime()
      : null;
    const trialEnd = user.subscription?.trial_end
      ? new Date(user.subscription.trial_end).getTime()
      : null;
    const alDia = status === 'active' && periodEnd !== null && periodEnd > now;
    const enTrial = status === 'trialing' && trialEnd !== null && trialEnd > now;
    const vencido = !alDia && !enTrial;
    if (filterPlan === 'al_dia' && !alDia) return false;
    if (filterPlan === 'trial' && !enTrial) return false;
    if (filterPlan === 'vencido' && !vencido) return false;

    return true;
  });

  // Sort: active subscribers first by current_period_start ASC (oldest activation first),
  // then trialing, then inactive at the bottom.
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const rank = (u: UserWithSubscription) => {
      const s = u.subscription?.status;
      if (s === 'active') return 0;
      if (s === 'trialing') return 1;
      return 2;
    };
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = a.subscription?.current_period_start ? new Date(a.subscription.current_period_start).getTime() : Infinity;
    const tb = b.subscription?.current_period_start ? new Date(b.subscription.current_period_start).getTime() : Infinity;
    return ta - tb;
  });

  const metaBadge = (m?: MetaStatus) => {
    if (!m) return <Badge variant="outline" className="text-xs">Sin consultar</Badge>;
    if (m.source === 'external') {
      return <Badge variant={m.local_active ? 'default' : 'destructive'} className="text-xs">QR {m.local_active ? 'Activa' : 'Inactiva'}</Badge>;
    }
    const s = m.status;
    const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
      s === 'CONNECTED' ? 'default'
      : s === 'FLAGGED' || s === 'RESTRICTED' ? 'destructive'
      : s === 'PENDING' ? 'secondary'
      : 'outline';
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant={variant} className="text-xs w-fit">{s}</Badge>
        {m.quality && <span className="text-[10px] text-muted-foreground">Q: {m.quality}</span>}
        {m.error && <span className="text-[10px] text-destructive truncate max-w-[140px]" title={m.error}>{m.error}</span>}
      </div>
    );
  };

  const targetCandidates = users
    .filter(u => !reassignAccount || u.user_id !== reassignAccount.from_user)
    .filter(u =>
      !reassignSearch ||
      u.email.toLowerCase().includes(reassignSearch.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(reassignSearch.toLowerCase())
    )
    .slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterActive} onValueChange={(v) => setFilterActive(v as typeof filterActive)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Usuario" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los usuarios</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterWhatsapp} onValueChange={(v) => setFilterWhatsapp(v as typeof filterWhatsapp)}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="WhatsApp" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">WhatsApp: todos</SelectItem>
            <SelectItem value="with">Con WhatsApp activo</SelectItem>
            <SelectItem value="without">Sin WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPlan} onValueChange={(v) => setFilterPlan(v as typeof filterPlan)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Plan: todos</SelectItem>
            <SelectItem value="al_dia">Al día</SelectItem>
            <SelectItem value="trial">En prueba</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground ml-auto">
          {filteredUsers.length} / {users.length}
        </div>
        <Button variant="outline" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button variant="outline" onClick={refreshMetaStatus} disabled={loadingMeta}>
          <Shield className={`h-4 w-4 mr-2 ${loadingMeta ? 'animate-spin' : ''}`} />
          Estado Meta
        </Button>
        <Button
          variant="destructive"
          onClick={() => setBulkConfirmOpen(true)}
          disabled={bulkDeleting}
          title="Eliminar todos los usuarios que no tienen ningún número de WhatsApp conectado"
        >
          <Trash2 className={`h-4 w-4 mr-2 ${bulkDeleting ? 'animate-pulse' : ''}`} />
          Eliminar sin WhatsApp ({users.filter(u => !u.platforms.some(p => p === 'WhatsApp' || p === 'WA External')).length})
        </Button>
      </div>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuarios sin WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente todos los usuarios registrados que no tienen ningún número de WhatsApp conectado (incluye los que tienen el número desactivado o nunca conectaron uno). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteWithoutWhatsApp}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Eliminando...' : 'Eliminar todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-md border overflow-x-auto">
        <Table>
           <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado usuario</TableHead>
              <TableHead>Estado WhatsApp (Meta)</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Activado el</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Cargando usuarios...
                </TableCell>
              </TableRow>
            ) : sortedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  No se encontraron usuarios
                </TableCell>
              </TableRow>
            ) : (
              sortedUsers.map((user) => {
                const status = user.subscription?.status;
                const periodEnd = user.subscription?.current_period_end ? new Date(user.subscription.current_period_end).getTime() : null;
                const isExpired = !(status === 'active' && periodEnd !== null && periodEnd > now) && status !== 'trialing';
                return (
                <TableRow key={user.user_id}>
                  <TableCell className="font-medium">
                    {user.full_name || 'Sin nombre'}
                  </TableCell>
                  <TableCell className="text-sm">{user.email}</TableCell>
                  <TableCell className="text-sm font-mono">
                    {user.phone_number || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <Select
                       value={user.subscription?.plan || 'professional'}
                      onValueChange={(value) => handleUpdateSubscription(user.user_id, 'plan', value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                        <SelectItem value="esoterico_pro">Nichos Difíciles</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.subscription ? getStatusBadge(user.subscription.status) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {user.whatsapp_accounts.length === 0 ? (
                        <span className="text-muted-foreground text-xs">Sin WhatsApp</span>
                      ) : user.whatsapp_accounts.map(wa => (
                        <div key={wa.id} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{wa.phone_number}</span>
                          {metaBadge(metaStatus[wa.id])}
                          {wa.is_active && isExpired && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2"
                              onClick={() => openReassign(wa.id, wa.phone_number, user.user_id)}
                              title="Reasignar este número a otro usuario"
                            >
                              <ArrowRightLeft className="h-3 w-3 mr-1" />
                              <span className="text-xs">Reasignar</span>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.subscription?.current_period_end 
                      ? format(new Date(user.subscription.current_period_end), 'dd MMM yyyy', { locale: es })
                      : user.subscription?.trial_end
                        ? `Trial: ${format(new Date(user.subscription.trial_end), 'dd MMM', { locale: es })}`
                        : '-'
                    }
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.subscription?.current_period_start
                      ? format(new Date(user.subscription.current_period_start), 'dd MMM yyyy', { locale: es })
                      : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateSubscription(user.user_id, 'status', 'active')}
                        disabled={user.subscription?.status === 'active'}
                        title="Activar"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openManageDialog(user)}
                        title="Gestionar días/fechas"
                      >
                        <CalendarDays className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openChargeDialog(user)}
                        title="Cobrar manualmente"
                      >
                        <CreditCard className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeactivateUser(user)}
                        disabled={user.subscription?.status === 'canceled'}
                        title="Desactivar suscripción"
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        <span className="text-xs">Desactivar</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción eliminará permanentemente a <strong>{user.full_name || user.email}</strong> y todos sus datos asociados. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteUser(user.user_id, user.full_name || user.email)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reassign WhatsApp dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reasignar número de WhatsApp</DialogTitle>
            <DialogDescription>
              Vas a transferir el número <strong>{reassignAccount?.phone}</strong> a otro usuario. El dueño actual perderá acceso a esta conexión.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar usuario destino por email o nombre..."
              value={reassignSearch}
              onChange={(e) => setReassignSearch(e.target.value)}
            />
            <div className="border rounded-md max-h-72 overflow-auto">
              {targetCandidates.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Sin coincidencias</div>
              ) : targetCandidates.map(u => (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => setReassignTarget(u.user_id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/50",
                    reassignTarget === u.user_id && "bg-muted"
                  )}
                >
                  <div className="font-medium">{u.full_name || 'Sin nombre'}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </button>
              ))}
            </div>
            <Button onClick={handleReassign} disabled={!reassignTarget || submitting} className="w-full">
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Reasignar número
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Days/Date Dialog */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gestionar Suscripción</DialogTitle>
            <DialogDescription>
              {selectedUser?.full_name || selectedUser?.email} — Estado actual: {selectedUser?.subscription?.status || 'Sin suscripción'}
              {selectedUser?.subscription?.current_period_end && (
                <> · Vence: {format(new Date(selectedUser.subscription.current_period_end), 'dd MMM yyyy', { locale: es })}</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Pending Alerts */}
            {userPendingAlerts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-amber-600">Alertas Pendientes ({userPendingAlerts.length})</Label>
                  <Button size="sm" variant="outline" onClick={handleDismissAllAlerts}>
                    <Check className="h-3 w-3 mr-1" />
                    Marcar todas pagadas
                  </Button>
                </div>
                <div className="space-y-2">
                  {userPendingAlerts.map(alert => (
                    <div key={alert.id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      <div className="text-sm">
                        <span className="font-semibold">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(alert.amount)}</span>
                        {alert.message && <span className="text-muted-foreground ml-2">— {alert.message}</span>}
                        <span className="text-xs text-muted-foreground ml-2">{format(new Date(alert.sent_at), 'dd MMM', { locale: es })}</span>
                      </div>
                      <Button size="sm" variant="default" onClick={() => handleMarkAlertPaid(alert.id)} className="h-7 text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Pagado
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="border-t" />
              </div>
            )}

            {/* Payment Method (required for activation) */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Método de pago usado *</Label>
              <Select value={manageMethod} onValueChange={setManageMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona método de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                  <SelectItem value="nequi">Nequi</SelectItem>
                  <SelectItem value="daviplata">Daviplata</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                  <SelectItem value="cortesia">Cortesía / Sin cobro</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Monto (COP) — opcional"
                value={manageAmount}
                onChange={(e) => setManageAmount(e.target.value)}
              />
            </div>

            <div className="border-t" />

            {/* Add Days */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Agregar días</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="30"
                  value={addDays}
                  onChange={(e) => setAddDays(e.target.value)}
                  className="w-24"
                />
                <div className="flex gap-1">
                  {[7, 15, 30, 60, 90].map(d => (
                    <Button key={d} size="sm" variant="outline" onClick={() => setAddDays(String(d))}>
                      {d}d
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={handleAddDays} disabled={submitting || !addDays} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Agregar {addDays} días
              </Button>
            </div>

            <div className="border-t" />

            {/* Set Renewal Date */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Establecer fecha de renovación</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !renewalDate && "text-muted-foreground")}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {renewalDate ? format(renewalDate, 'dd MMM yyyy', { locale: es }) : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={renewalDate}
                    onSelect={setRenewalDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Button onClick={handleSetRenewalDate} disabled={submitting || !renewalDate} variant="secondary" className="w-full">
                <CalendarDays className="h-4 w-4 mr-2" />
                Establecer fecha
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Charge Dialog */}
      <Dialog open={chargeDialogOpen} onOpenChange={setChargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrar Manualmente</DialogTitle>
            <DialogDescription>
              Registra un cobro para {selectedUser?.full_name || selectedUser?.email}. Se activará la suscripción por 30 días adicionales.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Monto (COP) *</Label>
              <Input
                type="number"
                placeholder="50000"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={chargeMethod} onValueChange={setChargeMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                  <SelectItem value="nequi">Nequi</SelectItem>
                  <SelectItem value="daviplata">Daviplata</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Referencia</Label>
              <Input
                placeholder="Número de transacción..."
                value={chargeReference}
                onChange={(e) => setChargeReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Notas adicionales..."
                value={chargeNotes}
                onChange={(e) => setChargeNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChargeDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleManualCharge} disabled={submitting || !chargeAmount}>
                {submitting ? 'Registrando...' : 'Registrar Cobro'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate subscription confirmation */}
      <AlertDialog open={!!deactivateUser} onOpenChange={(o) => !o && setDeactivateUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará la suscripción de <strong>{deactivateUser?.full_name || deactivateUser?.email}</strong> y perderá el acceso al servicio. El usuario no será eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
