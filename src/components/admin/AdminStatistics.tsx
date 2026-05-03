import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageSquare, Users, TrendingUp, BarChart3, UserCheck, UserX, CreditCard, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  is_active_account: boolean; // logged in / has activity
  subscription_status: string | null;
  subscription_plan: string | null;
  current_period_end: string | null;
  has_active_plan: boolean;
  total_messages: number;
}

interface DailyStats { date: string; messages: number; }

const chartConfig = {
  messages: { label: 'Mensajes', color: 'hsl(var(--primary))' },
};

export const AdminStatistics = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [totals, setTotals] = useState({ messages: 0, conversations: 0 });
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userDaily, setUserDaily] = useState<DailyStats[]>([]);
  const [loadingUser, setLoadingUser] = useState(false);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase
        .from('profiles').select('user_id, full_name, created_at');

      const { data: subs } = await supabase
        .from('subscriptions')
        .select('user_id, plan, status, current_period_end, trial_end');

      const { data: { session } } = await supabase.auth.getSession();
      const usersMap: Record<string, { email: string; last_sign_in_at?: string | null }> = {};
      if (session) {
        const resp = await supabase.functions.invoke('admin-get-users', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        for (const u of resp.data?.users || []) {
          usersMap[u.id] = { email: u.email || '', last_sign_in_at: u.last_sign_in_at };
        }
      }

      const { data: accounts } = await supabase
        .from('whatsapp_accounts').select('id, user_id');
      const accountToUser: Record<string, string> = {};
      accounts?.forEach(a => { accountToUser[a.id] = a.user_id; });

      const { data: conversations } = await supabase
        .from('conversations').select('id, whatsapp_account_id');
      const convToUser: Record<string, string> = {};
      conversations?.forEach(c => {
        const uid = accountToUser[c.whatsapp_account_id];
        if (uid) convToUser[c.id] = uid;
      });

      const { data: messages } = await supabase
        .from('messages').select('conversation_id, created_at')
        .order('created_at', { ascending: false }).limit(5000);

      const userMsgCount: Record<string, number> = {};
      const dailyMap: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        dailyMap[format(subDays(new Date(), i), 'yyyy-MM-dd')] = 0;
      }
      messages?.forEach(m => {
        const uid = convToUser[m.conversation_id];
        if (uid) userMsgCount[uid] = (userMsgCount[uid] || 0) + 1;
        const day = format(new Date(m.created_at), 'yyyy-MM-dd');
        if (dailyMap[day] !== undefined) dailyMap[day]++;
      });

      const now = new Date();
      const rows: UserRow[] = (profiles || []).map(p => {
        const sub = subs?.find(s => s.user_id === p.user_id);
        const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
        const trialEnd = sub?.trial_end ? new Date(sub.trial_end) : null;
        const hasActivePlan = !!sub && (
          (sub.status === 'active' && periodEnd && periodEnd > now) ||
          (sub.status === 'trialing' && trialEnd && trialEnd > now)
        );
        return {
          user_id: p.user_id,
          full_name: p.full_name || usersMap[p.user_id]?.email || 'Sin nombre',
          email: usersMap[p.user_id]?.email || '',
          created_at: p.created_at,
          is_active_account: !!usersMap[p.user_id]?.last_sign_in_at,
          subscription_status: sub?.status ?? null,
          subscription_plan: sub?.plan ?? null,
          current_period_end: sub?.current_period_end ?? null,
          has_active_plan: hasActivePlan,
          total_messages: userMsgCount[p.user_id] || 0,
        };
      }).sort((a, b) => b.total_messages - a.total_messages);

      const dailyArr = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, m]) => ({
          date: format(new Date(date + 'T12:00:00'), 'dd MMM', { locale: es }),
          messages: m,
        }));

      setUsers(rows);
      setDailyStats(dailyArr);
      setTotals({
        messages: messages?.length || 0,
        conversations: conversations?.length || 0,
      });
    } catch (e) {
      console.error('Error fetching stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const openUserDetail = async (user: UserRow) => {
    setSelectedUser(user);
    setLoadingUser(true);
    setUserDaily([]);
    try {
      const { data: accounts } = await supabase
        .from('whatsapp_accounts').select('id').eq('user_id', user.user_id);
      const accIds = (accounts || []).map(a => a.id);
      if (accIds.length === 0) { setLoadingUser(false); return; }

      const { data: convs } = await supabase
        .from('conversations').select('id').in('whatsapp_account_id', accIds);
      const convIds = (convs || []).map(c => c.id);
      if (convIds.length === 0) { setLoadingUser(false); return; }

      const since = subDays(new Date(), 29).toISOString();
      const { data: msgs } = await supabase
        .from('messages').select('created_at, direction')
        .in('conversation_id', convIds)
        .gte('created_at', since)
        .limit(10000);

      const dailyMap: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        dailyMap[format(subDays(new Date(), i), 'yyyy-MM-dd')] = 0;
      }
      msgs?.forEach(m => {
        const day = format(new Date(m.created_at), 'yyyy-MM-dd');
        if (dailyMap[day] !== undefined) dailyMap[day]++;
      });
      const arr = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, messages]) => ({
          date: format(new Date(date + 'T12:00:00'), 'dd MMM', { locale: es }),
          messages,
        }));
      setUserDaily(arr);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUser(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.is_active_account).length;
  const inactiveUsers = totalUsers - activeUsers;
  const usersWithPlan = users.filter(u => u.has_active_plan).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Usuarios</p>
                <p className="text-2xl font-bold">{totalUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><UserCheck className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Activos</p>
                <p className="text-2xl font-bold">{activeUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted"><UserX className="h-5 w-5 text-muted-foreground" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Inactivos</p>
                <p className="text-2xl font-bold">{inactiveUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><CreditCard className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Con Plan Activo</p>
                <p className="text-2xl font-bold">{usersWithPlan}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Mensajes Globales por Día (últimos 30 días)
          </CardTitle>
          <CardDescription>Total: {totals.messages.toLocaleString()} mensajes · {totals.conversations.toLocaleString()} conversaciones</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="messages" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Lista de Usuarios</CardTitle>
              <CardDescription>Haz clic en un usuario para ver mensajes por día</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado Plan</TableHead>
                <TableHead className="text-right">Mensajes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(u => (
                <TableRow
                  key={u.user_id}
                  className="cursor-pointer"
                  onClick={() => openUserDetail(u)}
                >
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                  <TableCell>
                    {u.is_active_account
                      ? <Badge variant="default">Activo</Badge>
                      : <Badge variant="secondary">Inactivo</Badge>}
                  </TableCell>
                  <TableCell className="capitalize">{u.subscription_plan || '—'}</TableCell>
                  <TableCell>
                    {u.has_active_plan
                      ? <Badge className="bg-green-600 hover:bg-green-700">Plan activo</Badge>
                      : <Badge variant="outline">Sin pago</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{u.total_messages.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin resultados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User detail dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedUser?.full_name}</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs">Plan</p>
                  <p className="font-semibold capitalize">{selectedUser.subscription_plan || '—'}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs">Estado</p>
                  <p className="font-semibold">{selectedUser.subscription_status || '—'}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs">Plan activo</p>
                  <p className="font-semibold">{selectedUser.has_active_plan ? 'Sí' : 'No'}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs">Total mensajes</p>
                  <p className="font-semibold">{selectedUser.total_messages.toLocaleString()}</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Mensajes por día (últimos 30 días)
                </h4>
                {loadingUser ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : (
                  <ChartContainer config={chartConfig} className="h-[280px] w-full">
                    <BarChart data={userDaily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
