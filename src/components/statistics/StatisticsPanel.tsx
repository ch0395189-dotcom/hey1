import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  MessageCircle, 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCheck,
  Send,
  Bot,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

interface Stats {
  totalConversations: number;
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  activeContacts: number;
  avgResponseTime: string;
  messagesByDay: { date: string; count: number }[];
  messageStatusBreakdown: { name: string; value: number; color: string }[];
}

export const StatisticsPanel = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch conversations
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id, created_at');

      // Fetch messages
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('id, direction, status, created_at');

      if (convError || msgError) {
        console.error('Error fetching stats:', convError || msgError);
        return;
      }

      const totalConversations = conversations?.length || 0;
      const totalMessages = messages?.length || 0;
      const sentMessages = messages?.filter(m => m.direction === 'outgoing').length || 0;
      const receivedMessages = messages?.filter(m => m.direction === 'incoming').length || 0;

      // Messages by day (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return {
          date: format(date, 'EEE', { locale: es }),
          fullDate: startOfDay(date).toISOString(),
          count: 0,
        };
      });

      messages?.forEach(msg => {
        const msgDate = startOfDay(new Date(msg.created_at)).toISOString();
        const dayEntry = last7Days.find(d => d.fullDate === msgDate);
        if (dayEntry) {
          dayEntry.count++;
        }
      });

      // Message status breakdown
      const statusCounts = {
        sent: messages?.filter(m => m.status === 'sent').length || 0,
        delivered: messages?.filter(m => m.status === 'delivered').length || 0,
        read: messages?.filter(m => m.status === 'read').length || 0,
        pending: messages?.filter(m => !m.status || m.status === 'pending').length || 0,
      };

      const messageStatusBreakdown = [
        { name: 'Enviados', value: statusCounts.sent, color: 'hsl(var(--primary))' },
        { name: 'Entregados', value: statusCounts.delivered, color: 'hsl(var(--secondary))' },
        { name: 'Leídos', value: statusCounts.read, color: 'hsl(var(--accent))' },
        { name: 'Pendientes', value: statusCounts.pending, color: 'hsl(var(--muted))' },
      ].filter(s => s.value > 0);

      // Unique contacts
      const uniquePhones = new Set(conversations?.map(c => c.id));

      setStats({
        totalConversations,
        totalMessages,
        sentMessages,
        receivedMessages,
        activeContacts: uniquePhones.size,
        avgResponseTime: '< 5 min',
        messagesByDay: last7Days.map(d => ({ date: d.date, count: d.count })),
        messageStatusBreakdown,
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full p-6 space-y-6 overflow-y-auto">
        <h2 className="font-display font-semibold text-2xl">Estadísticas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "Conversaciones",
      value: stats.totalConversations,
      icon: MessageCircle,
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "Mensajes Totales",
      value: stats.totalMessages,
      icon: Send,
      trend: "+8%",
      trendUp: true,
    },
    {
      title: "Contactos Activos",
      value: stats.activeContacts,
      icon: Users,
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "Tiempo de Respuesta",
      value: stats.avgResponseTime,
      icon: Clock,
      trend: "-15%",
      trendUp: true,
    },
  ];

  return (
    <div className="h-full p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-2xl">Estadísticas</h2>
        <p className="text-sm text-muted-foreground">Últimos 7 días</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{stat.value}</span>
                  <span className={`flex items-center text-xs ${stat.trendUp ? 'text-green-500' : 'text-red-500'}`}>
                    {stat.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {stat.trend}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Messages Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Actividad de Mensajes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.messagesByDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Message Status Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <CheckCheck className="w-5 h-5 text-primary" />
                Estado de Mensajes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {stats.messageStatusBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.messageStatusBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {stats.messageStatusBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Sin datos
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {stats.messageStatusBreakdown.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <span>{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Mensajes Enviados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.sentMessages}</div>
              <p className="text-sm text-muted-foreground mt-1">
                mensajes enviados por ti
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Mensajes Recibidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.receivedMessages}</div>
              <p className="text-sm text-muted-foreground mt-1">
                mensajes de tus clientes
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};
