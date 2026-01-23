import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Bell, Search, RefreshCw, Check, Clock, X } from 'lucide-react';

interface PaymentAlert {
  id: string;
  user_id: string;
  admin_id: string;
  amount: number;
  currency: string;
  message: string | null;
  status: string;
  sent_at: string;
  paid_at: string | null;
}

interface UserOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

export const PaymentAlerts = () => {
  const [alerts, setAlerts] = useState<PaymentAlert[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_alerts')
        .select('*')
        .order('sent_at', { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      if (profilesError) throw profilesError;

      const { data: authData } = await supabase.functions.invoke('admin-get-users');
      
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: { id: string; email: string }) => {
          emailMap.set(u.id, u.email);
        });
      }

      const usersWithEmails = profiles?.map(profile => ({
        user_id: profile.user_id,
        full_name: profile.full_name,
        email: emailMap.get(profile.user_id) || 'N/A',
      })) || [];

      setUsers(usersWithEmails);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId || !amount) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { error } = await supabase
        .from('payment_alerts')
        .insert({
          user_id: selectedUserId,
          admin_id: session.user.id,
          amount: parseInt(amount),
          currency: 'COP',
          message: message || null,
          status: 'pending',
        });

      if (error) throw error;

      toast.success('Alerta de cobro enviada');
      setDialogOpen(false);
      resetForm();
      fetchAlerts();
    } catch (error) {
      console.error('Error creating alert:', error);
      toast.error('Error al crear la alerta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (alertId: string, status: 'paid' | 'canceled') => {
    try {
      const updateData: Record<string, unknown> = { status };
      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('payment_alerts')
        .update(updateData)
        .eq('id', alertId);

      if (error) throw error;

      toast.success(status === 'paid' ? 'Marcado como pagado' : 'Alerta cancelada');
      fetchAlerts();
    } catch (error) {
      console.error('Error updating alert:', error);
      toast.error('Error al actualizar la alerta');
    }
  };

  const resetForm = () => {
    setSelectedUserId('');
    setAmount('');
    setMessage('');
  };

  const getUserDisplay = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    return user ? (user.full_name || user.email) : userId;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode; label: string }> = {
      pending: { variant: 'secondary', icon: <Clock className="h-3 w-3" />, label: 'Pendiente' },
      paid: { variant: 'default', icon: <Check className="h-3 w-3" />, label: 'Pagado' },
      canceled: { variant: 'destructive', icon: <X className="h-3 w-3" />, label: 'Cancelado' },
    };
    const { variant, icon, label } = config[status] || config.pending;
    return (
      <Badge variant={variant} className="flex items-center gap-1 w-fit">
        {icon}
        {label}
      </Badge>
    );
  };

  const filteredAlerts = alerts.filter(alert => {
    const user = users.find(u => u.user_id === alert.user_id);
    const searchLower = searchTerm.toLowerCase();
    return (
      user?.full_name?.toLowerCase().includes(searchLower) ||
      user?.email.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Alertas de Cobro</CardTitle>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Alerta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Alerta de Cobro</DialogTitle>
                <DialogDescription>
                  Envía una notificación de cobro a un usuario. La alerta será visible en su dashboard.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user">Usuario *</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un usuario" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          {user.full_name || 'Sin nombre'} - {user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Monto a Cobrar (COP) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensaje Personalizado</Label>
                  <Textarea
                    id="message"
                    placeholder="Ej: Tu suscripción vence pronto. Por favor realiza el pago para continuar usando el servicio."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Enviando...' : 'Enviar Alerta'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          Notifica a los usuarios sobre pagos pendientes o próximos a vencer
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={fetchAlerts} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Cargando alertas...
                    </TableCell>
                  </TableRow>
                ) : filteredAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay alertas de cobro
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">
                        {getUserDisplay(alert.user_id)}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {formatAmount(alert.amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(alert.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(alert.sent_at), 'dd MMM yyyy', { locale: es })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {alert.paid_at 
                          ? format(new Date(alert.paid_at), 'dd MMM yyyy', { locale: es })
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                        {alert.message || '-'}
                      </TableCell>
                      <TableCell>
                        {alert.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateStatus(alert.id, 'paid')}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Pagado
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUpdateStatus(alert.id, 'canceled')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
