import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserX, RefreshCw, Trash2, Search, Download } from 'lucide-react';

interface OrphanUser {
  user_id: string;
  full_name: string | null;
  email: string;
  created_at: string;
  days_old: number;
}

export const OrphanUsers = () => {
  const [users, setUsers] = useState<OrphanUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [confirmSingle, setConfirmSingle] = useState<OrphanUser | null>(null);

  const fetchOrphans = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, created_at');
      if (pErr) throw pErr;

      const { data: waAccounts, error: wErr } = await supabase
        .from('whatsapp_accounts')
        .select('user_id');
      if (wErr) throw wErr;

      const { data: platAccounts } = await supabase
        .from('platform_accounts')
        .select('user_id');

      const withAccount = new Set<string>();
      waAccounts?.forEach((w) => withAccount.add(w.user_id));
      platAccounts?.forEach((p) => withAccount.add(p.user_id));

      const { data: authData } = await supabase.functions.invoke('admin-get-users');
      const emailMap = new Map<string, string>();
      const list = (authData?.data?.users || authData?.users || []) as { id: string; email?: string }[];
      list.forEach((u) => { if (u.id && u.email) emailMap.set(u.id, u.email); });

      const now = Date.now();
      const orphans: OrphanUser[] = (profiles || [])
        .filter((p) => !withAccount.has(p.user_id))
        .map((p) => {
          const created = new Date(p.created_at).getTime();
          const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
          return {
            user_id: p.user_id,
            full_name: p.full_name,
            email: emailMap.get(p.user_id) || 'N/A',
            created_at: p.created_at,
            days_old: days,
          };
        })
        .filter((u) => u.days_old >= 1)
        .sort((a, b) => b.days_old - a.days_old);

      setUsers(orphans);
    } catch (e) {
      console.error('Error fetching orphans:', e);
      toast.error('Error al cargar usuarios huérfanos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrphans(); }, []);

  const deleteUser = async (userId: string, label: string) => {
    setDeletingId(userId);
    try {
      const { error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId },
      });
      if (error) throw error;
      toast.success(`Usuario "${label}" eliminado`);
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    } catch (e) {
      console.error('Error deleting:', e);
      toast.error('Error al eliminar usuario');
    } finally {
      setDeletingId(null);
      setConfirmSingle(null);
    }
  };

  const deleteAll = async () => {
    setBulkDeleting(true);
    let ok = 0, fail = 0;
    for (const u of filteredUsers) {
      try {
        const { error } = await supabase.functions.invoke('admin-delete-user', {
          body: { userId: u.user_id },
        });
        if (error) throw error;
        ok++;
      } catch (e) {
        console.error('Bulk delete error for', u.email, e);
        fail++;
      }
    }
    setBulkDeleting(false);
    setConfirmBulkOpen(false);
    toast.success(`Eliminados: ${ok}${fail ? ` · Fallidos: ${fail}` : ''}`);
    fetchOrphans();
  };

  const exportCSV = () => {
    if (filteredUsers.length === 0) {
      toast.error('No hay usuarios para exportar');
      return;
    }
    const headers = ['Email', 'Nombre', 'Creado', 'Días'];
    const rows = filteredUsers.map((u) => [
      u.email,
      u.full_name || '',
      format(new Date(u.created_at), 'yyyy-MM-dd HH:mm'),
      u.days_old.toString(),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios_huerfanos_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Archivo exportado');
  };

  const filteredUsers = users.filter((u) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return u.email.toLowerCase().includes(s) || (u.full_name || '').toLowerCase().includes(s);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            <CardTitle>Usuarios Huérfanos</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={filteredUsers.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={fetchOrphans} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmBulkOpen(true)}
              disabled={filteredUsers.length === 0 || bulkDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar todos ({filteredUsers.length})
            </Button>
          </div>
        </div>
        <CardDescription>
          Usuarios registrados hace más de 1 día sin ningún número de WhatsApp ni cuenta de plataforma conectada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Antigüedad</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No hay usuarios huérfanos</TableCell></TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="text-sm">{u.full_name || <span className="text-muted-foreground">Sin nombre</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(u.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.days_old >= 7 ? 'destructive' : 'secondary'}>
                          {u.days_old} día{u.days_old === 1 ? '' : 's'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmSingle(u)}
                          disabled={deletingId === u.user_id}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          {deletingId === u.user_id ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {filteredUsers.length} usuarios huérfanos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente los usuarios listados (creados hace más de 1 día sin ningún número/plataforma). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAll}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Eliminando...' : 'Eliminar todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmSingle} onOpenChange={(o) => !o && setConfirmSingle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente {confirmSingle?.email}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSingle && deleteUser(confirmSingle.user_id, confirmSingle.email)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};