import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MousePointerClick, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ClickRow {
  id: string;
  user_id: string | null;
  page_path: string | null;
  referrer: string | null;
  device: string | null;
  created_at: string;
}

export const WhatsAppButtonStats = () => {
  const [days, setDays] = useState('7');
  const [rows, setRows] = useState<ClickRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - Number(days) * 86400000).toISOString();
      const { data, error } = await supabase
        .from('whatsapp_button_clicks')
        .select('id, user_id, page_path, referrer, device, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error cargando estadísticas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const stats = useMemo(() => {
    const byPage = new Map<string, number>();
    const byDay = new Map<string, number>();
    let mobile = 0;
    let logged = 0;
    for (const r of rows) {
      const page = r.page_path || '(desconocida)';
      byPage.set(page, (byPage.get(page) || 0) + 1);
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
      if (r.device === 'mobile') mobile++;
      if (r.user_id) logged++;
    }
    return {
      total: rows.length,
      mobile,
      logged,
      pages: [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      daysList: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14),
    };
  }, [rows]);

  const maxDay = Math.max(1, ...stats.daysList.map(([, c]) => c));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-5 w-5" />
            <CardTitle>Clics en el botón de WhatsApp</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último día</SelectItem>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <CardDescription>
          Personas que hicieron clic en el botón flotante "Asesor" para escribirte por WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Clics totales" value={stats.total} />
          <Stat label="Desde móvil" value={stats.mobile} />
          <Stat label="Desde escritorio" value={stats.total - stats.mobile} />
          <Stat label="Con sesión iniciada" value={stats.logged} />
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Clics por día</h4>
          {stats.daysList.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin clics registrados en este periodo.</p>
          )}
          {stats.daysList.map(([day, count]) => (
            <div key={day} className="flex items-center gap-3">
              <span className="w-24 text-xs text-muted-foreground font-mono">{day}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(count / maxDay) * 100}%` }} />
              </div>
              <span className="w-10 text-right text-xs font-medium">{count}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Páginas con más clics</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Página</TableHead>
                <TableHead className="text-right">Clics</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.pages.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Sin datos</TableCell></TableRow>
              )}
              {stats.pages.map(([page, count]) => (
                <TableRow key={page}>
                  <TableCell className="font-mono text-xs break-all">{page}</TableCell>
                  <TableCell className="text-right">{count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Últimos clics</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Página</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Origen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 25).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString('es-CO')}</TableCell>
                    <TableCell className="font-mono text-xs break-all">{r.page_path || '-'}</TableCell>
                    <TableCell className="text-xs">{r.device || '-'}</TableCell>
                    <TableCell className="text-xs break-all">{r.referrer || 'directo'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border p-3 bg-card">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold mt-1">{value}</div>
  </div>
);
