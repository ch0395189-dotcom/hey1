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
import { Check, X, Search, RefreshCw, Trash2, CalendarDays, Plus, CreditCard, Ban } from 'lucide-react';
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
}

export const UsersTable = () => {
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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

      const { data: authData } = await supabase.functions.invoke('admin-get-users');
      
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: { id: string; email: string }) => {
          emailMap.set(u.id, u.email);
        });
      }

      const { data: waAccounts } = await supabase
        .from('whatsapp_accounts')
        .select('user_id, is_active, connection_type, phone_number');

      const { data: platAccounts } = await supabase
        .from('platform_accounts')
        .select('user_id, platform, is_active');

      const platformsMap = new Map<string, string[]>();
      const phoneMap = new Map<string, string>();
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

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone_number?.includes(searchTerm)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
           <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Plataformas</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Registro</TableHead>
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
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  No se encontraron usuarios
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
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
                      value={user.subscription?.plan || 'starter'}
                      onValueChange={(value) => handleUpdateSubscription(user.user_id, 'plan', value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
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
                    <div className="flex flex-wrap gap-1">
                      {user.platforms.length > 0 ? user.platforms.map(p => (
                        <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                      )) : <span className="text-muted-foreground text-xs">Ninguna</span>}
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
                    {format(new Date(user.created_at), 'dd MMM yyyy', { locale: es })}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
