import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface UserMessageStats {
  user_id: string;
  full_name: string;
  email: string;
  total_messages: number;
  inbound: number;
  outbound: number;
  conversations: number;
}

interface DailyStats {
  date: string;
  messages: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
  'hsl(200 70% 50%)',
  'hsl(120 60% 40%)',
  'hsl(45 90% 50%)',
];

const chartConfig = {
  messages: { label: 'Mensajes', color: 'hsl(var(--primary))' },
  inbound: { label: 'Recibidos', color: 'hsl(var(--chart-2, 160 60% 45%))' },
  outbound: { label: 'Enviados', color: 'hsl(var(--chart-3, 30 80% 55%))' },
};

export const AdminStatistics = () => {
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserMessageStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [totals, setTotals] = useState({ messages: 0, users: 0, conversations: 0 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Get all users with profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      // Get all users from admin edge function for emails
      const { data: { session } } = await supabase.auth.getSession();
      let usersMap: Record<string, { email: string; full_name: string }> = {};
      
      if (session) {
        const response = await supabase.functions.invoke('admin-get-users', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.data?.users) {
          for (const u of response.data.users) {
            usersMap[u.id] = { 
              email: u.email || '', 
              full_name: profiles?.find(p => p.user_id === u.id)?.full_name || u.email || 'Sin nombre' 
            };
          }
        }
      }

      // Get all whatsapp accounts to map to users
      const { data: accounts } = await supabase
        .from('whatsapp_accounts')
        .select('id, user_id');

      const accountToUser: Record<string, string> = {};
      accounts?.forEach(a => { accountToUser[a.id] = a.user_id; });

      // Get all conversations
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, whatsapp_account_id');

      const convToUser: Record<string, string> = {};
      const userConversations: Record<string, Set<string>> = {};
      conversations?.forEach(c => {
        const userId = accountToUser[c.whatsapp_account_id];
        if (userId) {
          convToUser[c.id] = userId;
          if (!userConversations[userId]) userConversations[userId] = new Set();
          userConversations[userId].add(c.id);
        }
      });

      // Get messages (last 1000 for stats)
      const { data: messages } = await supabase
        .from('messages')
        .select('id, conversation_id, direction, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Aggregate per user
      const statsMap: Record<string, { total: number; inbound: number; outbound: number }> = {};
      const dailyMap: Record<string, number> = {};

      // Initialize last 30 days
      for (let i = 29; i >= 0; i--) {
        const day = format(subDays(new Date(), i), 'yyyy-MM-dd');
        dailyMap[day] = 0;
      }

      messages?.forEach(msg => {
        const userId = convToUser[msg.conversation_id];
        if (userId) {
          if (!statsMap[userId]) statsMap[userId] = { total: 0, inbound: 0, outbound: 0 };
          statsMap[userId].total++;
          if (msg.direction === 'inbound') statsMap[userId].inbound++;
          else statsMap[userId].outbound++;
        }

        const day = format(new Date(msg.created_at), 'yyyy-MM-dd');
        if (dailyMap[day] !== undefined) {
          dailyMap[day]++;
        }
      });

      const userStatsArr: UserMessageStats[] = Object.entries(statsMap)
        .map(([userId, stats]) => ({
          user_id: userId,
          full_name: usersMap[userId]?.full_name || 'Sin nombre',
          email: usersMap[userId]?.email || '',
          total_messages: stats.total,
          inbound: stats.inbound,
          outbound: stats.outbound,
          conversations: userConversations[userId]?.size || 0,
        }))
        .sort((a, b) => b.total_messages - a.total_messages);

      const dailyArr = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, messages]) => ({
          date: format(new Date(date + 'T12:00:00'), 'dd MMM', { locale: es }),
          messages,
        }));

      setUserStats(userStatsArr);
      setDailyStats(dailyArr);
      setTotals({
        messages: messages?.length || 0,
        users: Object.keys(statsMap).length,
        conversations: conversations?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const top10 = userStats.slice(0, 10);
  const pieData = userStats.slice(0, 6).map(u => ({
    name: u.full_name?.split(' ')[0] || 'N/A',
    value: u.total_messages,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Mensajes</p>
                <p className="text-2xl font-bold">{totals.messages.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usuarios Activos</p>
                <p className="text-2xl font-bold">{totals.users}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conversaciones</p>
                <p className="text-2xl font-bold">{totals.conversations.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily messages line chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Mensajes por Día (últimos 30 días)
          </CardTitle>
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

      {/* Messages per user bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Mensajes por Cliente (Top 10)
          </CardTitle>
          <CardDescription>Recibidos vs Enviados</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis 
                dataKey="full_name" 
                type="category" 
                width={120} 
                tick={{ fontSize: 11 }} 
                tickFormatter={(v) => v?.length > 15 ? v.slice(0, 15) + '…' : v}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="inbound" stackId="a" fill="hsl(var(--chart-2, 160 60% 45%))" radius={[0, 0, 0, 0]} />
              <Bar dataKey="outbound" stackId="a" fill="hsl(var(--chart-3, 30 80% 55%))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Pie chart distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Distribución de Mensajes</CardTitle>
          <CardDescription>Top 6 clientes por volumen</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
};
