import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Megaphone, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Row {
  account_id: string;
  user_id: string;
  phone: string;
  meta_total_conversations: number;
  meta_marketing_conversations: number;
  meta_ctwa_conversations: number;
  inbox_new_conversations: number;
  inbox_inbound_messages: number;
  gap: number;
  gap_percentage: number;
  meta_error: string | null;
}

export const CtwaAnalytics = () => {
  const [days, setDays] = useState('7');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const url = `https://gnnucexcnkuevxfepwmw.supabase.co/functions/v1/admin-ctwa-analytics?days=${days}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (j?.error) throw new Error(j.error);
      setRows(j.results || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error cargando analítica');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const totals = rows.reduce(
    (acc, r) => ({
      meta: acc.meta + r.meta_total_conversations,
      marketing: acc.marketing + r.meta_marketing_conversations,
      ctwa: acc.ctwa + r.meta_ctwa_conversations,
      inbox: acc.inbox + r.inbox_new_conversations,
      msgs: acc.msgs + r.inbox_inbound_messages,
      gap: acc.gap + r.gap,
    }),
    { meta: 0, marketing: 0, ctwa: 0, inbox: 0, msgs: 0, gap: 0 },
  );
  const totalGapPct = totals.meta > 0 ? Math.round((totals.gap / totals.meta) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            <CardTitle>Campañas CTWA vs Bandeja</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último día</SelectItem>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="14">Últimos 14 días</SelectItem>
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
          Compara las conversaciones reportadas por Meta (incluye clics en anuncios Click-to-WhatsApp aunque el usuario no envíe mensaje) con las que realmente llegaron a la bandeja vía webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Conversaciones Meta" value={totals.meta} />
          <Stat label="Marketing / CTWA" value={`${totals.marketing} / ${totals.ctwa}`} />
          <Stat label="Conversaciones en bandeja" value={totals.inbox} />
          <Stat label="Brecha" value={`${totals.gap} (${totalGapPct}%)`} highlight={totalGapPct > 30} />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead className="text-right">Meta total</TableHead>
                <TableHead className="text-right">Marketing</TableHead>
                <TableHead className="text-right">CTWA</TableHead>
                <TableHead className="text-right">Bandeja</TableHead>
                <TableHead className="text-right">Mensajes inbound</TableHead>
                <TableHead className="text-right">Brecha</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Sin datos</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                  <TableCell className="text-right">{r.meta_total_conversations}</TableCell>
                  <TableCell className="text-right">{r.meta_marketing_conversations}</TableCell>
                  <TableCell className="text-right">{r.meta_ctwa_conversations}</TableCell>
                  <TableCell className="text-right">{r.inbox_new_conversations}</TableCell>
                  <TableCell className="text-right">{r.inbox_inbound_messages}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.gap_percentage > 30 ? 'destructive' : r.gap_percentage > 10 ? 'secondary' : 'outline'}>
                      {r.gap} ({r.gap_percentage}%)
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.meta_error ? (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" /> {r.meta_error}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">OK</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
          <p><strong>¿Por qué hay brecha?</strong> Meta cuenta una conversación cuando el usuario hace clic en un anuncio Click-to-WhatsApp aunque nunca envíe el mensaje (borra el texto prellenado o cierra el chat). Esos clics aparecen en Business Manager pero el webhook nunca los recibe, así que no llegan a la bandeja.</p>
          <p>Una brecha &gt; 30% suele indicar: tráfico CTWA frío, mensaje prellenado poco atractivo, o problemas de suscripción del webhook <code>messages</code> en la WABA.</p>
        </div>
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) => (
  <div className={`rounded-lg border p-3 ${highlight ? 'border-destructive/50 bg-destructive/5' : 'bg-card'}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold mt-1">{value}</div>
  </div>
);