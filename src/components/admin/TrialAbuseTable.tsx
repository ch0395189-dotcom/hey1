import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface Row {
  id: string;
  phone_number: string;
  phone_normalized: string;
  first_user_id: string;
  first_used_at: string;
  reuse_count: number;
  last_attempt_user_id: string | null;
  last_attempt_at: string | null;
}

export const TrialAbuseTable = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trial_phone_history' as any)
        .select('*')
        .gt('reuse_count', 0)
        .order('last_attempt_at', { ascending: false });
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      toast.error('Error al cargar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <div>
              <CardTitle>Reincidentes de prueba</CardTitle>
              <CardDescription>
                Números de WhatsApp que ya tuvieron prueba e intentaron reusarse en otra cuenta. Esos intentos se cancelan automáticamente.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No hay reincidentes detectados</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Dueño original</TableHead>
                  <TableHead>Primer uso</TableHead>
                  <TableHead>Intentos de reuso</TableHead>
                  <TableHead>Último intento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                    <TableCell className="font-mono text-xs">{r.first_user_id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.first_used_at), 'dd MMM yyyy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">{r.reuse_count}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.last_attempt_at ? (
                        <div className="flex flex-col">
                          <span>{format(new Date(r.last_attempt_at), 'dd MMM yyyy HH:mm', { locale: es })}</span>
                          <span className="font-mono text-muted-foreground">{r.last_attempt_user_id?.slice(0, 8)}…</span>
                        </div>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};