import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, X, Search, RefreshCw } from 'lucide-react';

interface UserWithSubscription {
  user_id: string;
  full_name: string | null;
  email: string;
  subscription: {
    id: string;
    plan: string;
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
  } | null;
  created_at: string;
  platforms: string[];
}

export const UsersTable = () => {
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch profiles with subscriptions
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, created_at');

      if (profilesError) throw profilesError;

      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('id, user_id, plan, status, trial_end, current_period_end');

      if (subsError) throw subsError;

      // Get emails from auth.users via edge function
      const { data: authData, error: authError } = await supabase.functions.invoke('admin-get-users');
      
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: { id: string; email: string }) => {
          emailMap.set(u.id, u.email);
        });
      }

      // Fetch active platform connections
      const { data: waAccounts } = await supabase
        .from('whatsapp_accounts')
        .select('user_id, is_active, connection_type');

      const { data: platAccounts } = await supabase
        .from('platform_accounts')
        .select('user_id, platform, is_active');

      const platformsMap = new Map<string, string[]>();
      waAccounts?.forEach(wa => {
        if (wa.is_active) {
          const list = platformsMap.get(wa.user_id) || [];
          const label = wa.connection_type === 'external' ? 'WA External' : 'WhatsApp';
          if (!list.includes(label)) list.push(label);
          platformsMap.set(wa.user_id, list);
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
          subscription: sub ? {
            id: sub.id,
            plan: sub.plan,
            status: sub.status,
            trial_end: sub.trial_end,
            current_period_end: sub.current_period_end,
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
      
      // If activating, set period dates
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
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
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
                <TableCell colSpan={8} className="text-center py-8">
                  Cargando usuarios...
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  No se encontraron usuarios
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell className="font-medium">
                    {user.full_name || 'Sin nombre'}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateSubscription(user.user_id, 'status', 'active')}
                        disabled={user.subscription?.status === 'active'}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Activar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateSubscription(user.user_id, 'status', 'canceled')}
                        disabled={user.subscription?.status === 'canceled'}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
