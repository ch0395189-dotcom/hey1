import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageCircle,
  Users,
  TrendingUp,
  CheckCheck,
  Send,
  Download,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Legend,
} from "recharts";
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";

type RangePreset = "1" | "7" | "15" | "30" | "custom";

interface DayRow {
  key: string;
  label: string;
  inbound: number;
  outbound: number;
  total: number;
}

interface Stats {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  newConversations: number;
  activeContacts: number;
  avgPerDay: number;
  bestDay: DayRow | null;
  messagesByDay: DayRow[];
  messageStatusBreakdown: { name: string; value: number; color: string }[];
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "1", label: "Hoy" },
  { value: "7", label: "7 días" },
  { value: "15", label: "15 días" },
  { value: "30", label: "30 días" },
  { value: "custom", label: "Personalizado" },
];

const toInputDate = (d: Date) => format(d, "yyyy-MM-dd");

/** Trae todas las filas paginando de 1000 en 1000 (PostgREST limita por página). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const page = 1000;
  let offset = 0;
  const out: T[] = [];
  // Máximo 50 páginas (50k filas) por seguridad
  for (let i = 0; i < 50; i++) {
    const { data, error } = await build(offset, offset + page - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }
  return out;
}

export const StatisticsPanel = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<RangePreset>("7");
  const [fromDate, setFromDate] = useState(toInputDate(subDays(new Date(), 6)));
  const [toDate, setToDate] = useState(toInputDate(new Date()));

  const { start, end, rangeLabel } = useMemo(() => {
    if (preset === "custom") {
      const s = startOfDay(parseISO(fromDate));
      const e = endOfDay(parseISO(toDate));
      return {
        start: s,
        end: e,
        rangeLabel: `${format(s, "d MMM yyyy", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`,
      };
    }
    const days = Number(preset);
    const e = endOfDay(new Date());
    const s = startOfDay(subDays(new Date(), days - 1));
    return {
      start: s,
      end: e,
      rangeLabel:
        days === 1
          ? `Hoy, ${format(e, "d MMM yyyy", { locale: es })}`
          : `Últimos ${days} días`,
    };
  }, [preset, fromDate, toDate]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const [messages, conversations] = await Promise.all([
        fetchAll<{ direction: string; status: string | null; created_at: string; conversation_id: string }>(
          (f, t) =>
            supabase
              .from("messages")
              .select("direction, status, created_at, conversation_id")
              .gte("created_at", startIso)
              .lte("created_at", endIso)
              .order("created_at", { ascending: true })
              .range(f, t)
        ),
        fetchAll<{ id: string; created_at: string }>((f, t) =>
          supabase
            .from("conversations")
            .select("id, created_at")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .range(f, t)
        ),
      ]);

      const isInbound = (d: string) => d === "inbound" || d === "incoming";

      const days = eachDayOfInterval({ start, end });
      const buckets = new Map<string, DayRow>();
      for (const d of days) {
        const key = format(d, "yyyy-MM-dd");
        buckets.set(key, {
          key,
          label: format(d, days.length > 15 ? "d MMM" : "EEE d", { locale: es }),
          inbound: 0,
          outbound: 0,
          total: 0,
        });
      }

      let received = 0;
      let sent = 0;
      const contacts = new Set<string>();

      for (const m of messages) {
        const key = format(new Date(m.created_at), "yyyy-MM-dd");
        const b = buckets.get(key);
        const inbound = isInbound(m.direction);
        if (inbound) {
          received++;
          contacts.add(m.conversation_id);
        } else {
          sent++;
        }
        if (b) {
          b.total++;
          if (inbound) b.inbound++;
          else b.outbound++;
        }
      }

      const messagesByDay = Array.from(buckets.values());
      const bestDay =
        messagesByDay.length > 0
          ? messagesByDay.reduce((a, b) => (b.total > a.total ? b : a))
          : null;

      const statusCounts = {
        sent: messages.filter((m) => m.status === "sent").length,
        delivered: messages.filter((m) => m.status === "delivered").length,
        read: messages.filter((m) => m.status === "read").length,
        pending: messages.filter((m) => !m.status || m.status === "pending").length,
      };

      setStats({
        totalMessages: messages.length,
        sentMessages: sent,
        receivedMessages: received,
        newConversations: conversations.length,
        activeContacts: contacts.size,
        avgPerDay: messagesByDay.length
          ? Math.round(messages.length / messagesByDay.length)
          : 0,
        bestDay,
        messagesByDay,
        messageStatusBreakdown: [
          { name: "Enviados", value: statusCounts.sent, color: "hsl(var(--primary))" },
          { name: "Entregados", value: statusCounts.delivered, color: "hsl(var(--secondary))" },
          { name: "Leídos", value: statusCounts.read, color: "hsl(var(--accent))" },
          { name: "Pendientes", value: statusCounts.pending, color: "hsl(var(--muted))" },
        ].filter((s) => s.value > 0),
      });
    } catch (error) {
      console.error("Error cargando estadísticas:", error);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const exportCsv = () => {
    if (!stats) return;
    const lines = [
      "fecha,recibidos,enviados,total",
      ...stats.messagesByDay.map((d) => `${d.key},${d.inbound},${d.outbound},${d.total}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estadisticas-mensajes-${format(start, "yyyyMMdd")}-${format(end, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = stats
    ? [
        { title: "Mensajes recibidos", value: stats.receivedMessages, icon: MessageCircle },
        { title: "Mensajes enviados", value: stats.sentMessages, icon: Send },
        { title: "Contactos que escribieron", value: stats.activeContacts, icon: Users },
        { title: "Promedio por día", value: stats.avgPerDay, icon: TrendingUp },
      ]
    : [];

  return (
    <div className="h-full p-4 sm:p-6 space-y-6 overflow-y-auto">
      <div className="flex flex-col gap-1">
        <h2 className="font-display font-semibold text-2xl">Estadísticas</h2>
        <p className="text-sm text-muted-foreground">{rangeLabel}</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={preset === p.value ? "default" : "outline"}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={fetchStats} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!stats}>
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
            </div>
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="stats-from" className="text-xs">Desde</Label>
                <Input
                  id="stats-from"
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="stats-to" className="text-xs">Hasta</Label>
                <Input
                  id="stats-to"
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={toInputDate(new Date())}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-44"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading || !stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
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
      ) : (
        <>
          {/* Tarjetas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-bold">{stat.value}</span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico por día */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Mensajes por día
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.messagesByDay}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" className="text-xs" interval="preserveStartEnd" />
                      <YAxis className="text-xs" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        name="Recibidos"
                        dataKey="inbound"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary) / 0.2)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        name="Enviados"
                        dataKey="outbound"
                        stroke="hsl(var(--accent))"
                        fill="hsl(var(--accent) / 0.15)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {stats.bestDay && stats.bestDay.total > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Día con más actividad:{" "}
                    <span className="font-medium text-foreground">
                      {format(parseISO(stats.bestDay.key), "d 'de' MMMM", { locale: es })}
                    </span>{" "}
                    ({stats.bestDay.total} mensajes)
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Estado de mensajes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <CheckCheck className="w-5 h-5 text-primary" />
                  Estado de mensajes
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
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span>
                        {entry.name}: {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detalle por día */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Detalle diario</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Recibidos</TableHead>
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...stats.messagesByDay].reverse().map((d) => (
                      <TableRow key={d.key}>
                        <TableCell className="whitespace-nowrap">
                          {format(parseISO(d.key), "EEE d MMM yyyy", { locale: es })}
                        </TableCell>
                        <TableCell className="text-right">{d.inbound}</TableCell>
                        <TableCell className="text-right">{d.outbound}</TableCell>
                        <TableCell className="text-right font-medium">{d.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap gap-6 p-4 border-t text-sm">
                <span>
                  Total mensajes: <strong>{stats.totalMessages}</strong>
                </span>
                <span>
                  Conversaciones nuevas: <strong>{stats.newConversations}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
