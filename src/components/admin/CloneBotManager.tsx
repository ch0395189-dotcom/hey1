import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Bot, Search, Loader2, ArrowRight } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface BotOption {
  config_id: string;
  config_name: string;
  wa_id: string;
  wa_display_name: string | null;
  wa_phone: string;
  user_email: string;
  user_full_name: string | null;
  node_count: number;
}

interface WhatsAppAccountOption {
  id: string;
  display_name: string | null;
  phone_number: string;
  user_email: string;
  user_full_name: string | null;
  has_bot: boolean;
}

export const CloneBotManager = () => {
  const [bots, setBots] = useState<BotOption[]>([]);
  const [accounts, setAccounts] = useState<WhatsAppAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceBotId, setSourceBotId] = useState<string>('');
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchTarget, setSearchTarget] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cloning, setCloning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get all configs with their wa_account info
      const { data: configs } = await supabase
        .from('chatbot_configs')
        .select('id, name, whatsapp_account_id');

      const { data: waAccounts } = await supabase
        .from('whatsapp_accounts')
        .select('id, display_name, phone_number, user_id');

      const { data: nodes } = await supabase
        .from('chatbot_flow_nodes')
        .select('chatbot_config_id');

      // Get user emails via admin function
      const { data: authData } = await supabase.functions.invoke('admin-get-users');
      const emailMap = new Map<string, string>();
      authData?.users?.forEach((u: { id: string; email: string }) => emailMap.set(u.id, u.email));

      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name');
      const nameMap = new Map<string, string | null>();
      profiles?.forEach(p => nameMap.set(p.user_id, p.full_name));

      // Count nodes per config
      const nodeCountMap = new Map<string, number>();
      nodes?.forEach(n => {
        nodeCountMap.set(n.chatbot_config_id, (nodeCountMap.get(n.chatbot_config_id) || 0) + 1);
      });

      const waById = new Map(waAccounts?.map(w => [w.id, w]) || []);
      const configsByWaId = new Map(configs?.map(c => [c.whatsapp_account_id, c]) || []);

      const botList: BotOption[] = (configs || [])
        .map(c => {
          const wa = waById.get(c.whatsapp_account_id);
          if (!wa) return null;
          return {
            config_id: c.id,
            config_name: c.name,
            wa_id: wa.id,
            wa_display_name: wa.display_name,
            wa_phone: wa.phone_number,
            user_email: emailMap.get(wa.user_id) || 'N/A',
            user_full_name: nameMap.get(wa.user_id) || null,
            node_count: nodeCountMap.get(c.id) || 0,
          };
        })
        .filter((b): b is BotOption => b !== null && b.node_count > 0)
        .sort((a, b) => b.node_count - a.node_count);

      const accountList: WhatsAppAccountOption[] = (waAccounts || []).map(wa => ({
        id: wa.id,
        display_name: wa.display_name,
        phone_number: wa.phone_number,
        user_email: emailMap.get(wa.user_id) || 'N/A',
        user_full_name: nameMap.get(wa.user_id) || null,
        has_bot: configsByWaId.has(wa.id),
      }));

      setBots(botList);
      setAccounts(accountList);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar bots y cuentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleClone = async () => {
    if (!sourceBotId || !targetAccountId) return;
    setCloning(true);
    try {
      const { data, error } = await supabase.rpc('clone_chatbot_to_account', {
        p_source_config_id: sourceBotId,
        p_target_whatsapp_account_id: targetAccountId,
      });
      if (error) throw error;
      toast.success('✅ Bot clonado correctamente');
      setConfirmOpen(false);
      setSourceBotId('');
      setTargetAccountId('');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error al clonar el bot');
    } finally {
      setCloning(false);
    }
  };

  const filteredBots = bots.filter(b => {
    const q = search.toLowerCase();
    return !q ||
      b.config_name.toLowerCase().includes(q) ||
      b.user_email.toLowerCase().includes(q) ||
      (b.user_full_name?.toLowerCase().includes(q) ?? false) ||
      (b.wa_display_name?.toLowerCase().includes(q) ?? false) ||
      b.wa_phone.includes(q);
  });

  const filteredAccounts = accounts.filter(a => {
    const q = searchTarget.toLowerCase();
    return !q ||
      a.user_email.toLowerCase().includes(q) ||
      (a.user_full_name?.toLowerCase().includes(q) ?? false) ||
      (a.display_name?.toLowerCase().includes(q) ?? false) ||
      a.phone_number.includes(q);
  });

  const sourceBot = bots.find(b => b.config_id === sourceBotId);
  const targetAccount = accounts.find(a => a.id === targetAccountId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Copy className="h-5 w-5" />
          <CardTitle>Clonar Bots entre Cuentas</CardTitle>
        </div>
        <CardDescription>
          Copia un bot completo (configuración, nodos, palabras clave y base de conocimiento) a la cuenta de WhatsApp de otro usuario.
          Si la cuenta destino ya tiene un bot, será reemplazado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Bot Origen */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Bot origen (a copiar)
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar bot por usuario, nombre, teléfono..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={sourceBotId} onValueChange={setSourceBotId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Selecciona bot (${filteredBots.length} disponibles)`} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px] bg-popover z-50">
                    {filteredBots.map(b => (
                      <SelectItem key={b.config_id} value={b.config_id}>
                        <div className="flex flex-col gap-0.5 py-1">
                          <span className="font-medium text-sm">
                            {b.config_name} <Badge variant="secondary" className="ml-1">{b.node_count} nodos</Badge>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {b.user_full_name || b.user_email} · {b.wa_display_name || b.wa_phone}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    {filteredBots.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">Sin resultados</div>
                    )}
                  </SelectContent>
                </Select>
                {sourceBot && (
                  <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
                    <div className="font-medium">{sourceBot.config_name}</div>
                    <div className="text-muted-foreground text-xs">
                      Usuario: {sourceBot.user_full_name || '—'} ({sourceBot.user_email})
                    </div>
                    <div className="text-muted-foreground text-xs">
                      WhatsApp: {sourceBot.wa_display_name || '—'} · {sourceBot.wa_phone}
                    </div>
                    <Badge variant="outline">{sourceBot.node_count} nodos</Badge>
                  </div>
                )}
              </div>

              {/* Cuenta Destino */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Cuenta destino (donde se copiará)
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cuenta por usuario, teléfono..."
                    value={searchTarget}
                    onChange={e => setSearchTarget(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Selecciona cuenta (${filteredAccounts.length} disponibles)`} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px] bg-popover z-50">
                    {filteredAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex flex-col gap-0.5 py-1">
                          <span className="font-medium text-sm">
                            {a.display_name || a.phone_number}
                            {a.has_bot && <Badge variant="destructive" className="ml-1 text-[10px]">Tiene bot</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {a.user_full_name || a.user_email} · {a.phone_number}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    {filteredAccounts.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">Sin resultados</div>
                    )}
                  </SelectContent>
                </Select>
                {targetAccount && (
                  <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
                    <div className="font-medium">{targetAccount.display_name || targetAccount.phone_number}</div>
                    <div className="text-muted-foreground text-xs">
                      Usuario: {targetAccount.user_full_name || '—'} ({targetAccount.user_email})
                    </div>
                    <div className="text-muted-foreground text-xs">Teléfono: {targetAccount.phone_number}</div>
                    {targetAccount.has_bot && (
                      <Badge variant="destructive" className="text-xs">⚠️ Esta cuenta ya tiene un bot — será reemplazado</Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!sourceBotId || !targetAccountId || sourceBot?.wa_id === targetAccount?.id}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Clonar Bot
              </Button>
            </div>
          </>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Clonar este bot?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>Se copiarán todos los nodos, palabras clave y base de conocimiento de:</p>
                  <p className="font-medium">📤 {sourceBot?.config_name} ({sourceBot?.user_email})</p>
                  <p>hacia la cuenta:</p>
                  <p className="font-medium">📥 {targetAccount?.display_name || targetAccount?.phone_number} ({targetAccount?.user_email})</p>
                  {targetAccount?.has_bot && (
                    <p className="text-destructive font-medium">⚠️ El bot existente en la cuenta destino será reemplazado por completo.</p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cloning}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleClone} disabled={cloning}>
                {cloning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Confirmar y clonar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
