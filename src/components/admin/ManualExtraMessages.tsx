import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';

interface UserOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

export const ManualExtraMessages = () => {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('1000');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name');
      const { data: authData } = await supabase.functions.invoke('admin-get-users');
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: { id: string; email: string }) => emailMap.set(u.id, u.email));
      }
      setUsers(
        (profiles || []).map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: emailMap.get(p.user_id) || 'N/A',
        }))
      );
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !amount) {
      toast.error('Completa los campos');
      return;
    }
    const qty = parseInt(amount);
    if (!qty || qty <= 0) {
      toast.error('Cantidad inválida');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('add_extra_messages', {
        _user_id: userId,
        _amount: qty,
      });
      if (error) throw error;
      toast.success(`+${qty.toLocaleString()} mensajes agregados al mes en curso`);
      setAmount('1000');
      setUserId('');
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar mensajes');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5" />
          <CardTitle>Agregar Mensajes Extra Manualmente</CardTitle>
        </div>
        <CardDescription>
          Suma mensajes adicionales al cupo mensual del usuario seleccionado (mes en curso).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label>Usuario</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un usuario" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || 'Sin nombre'} — {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cantidad de mensajes</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Agregando...' : 'Agregar mensajes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};