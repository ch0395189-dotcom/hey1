import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { ConversationsList, type Conversation } from '@/components/whatsapp/ConversationsList';
import { ChatWindow } from '@/components/whatsapp/ChatWindow';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface WaAccount {
  id: string;
  phone_number: string;
  connection_type: string | null;
  is_active: boolean;
}

const AdminInbox = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminCheck();

  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [targetName, setTargetName] = useState<string>('');
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (!userId || !isAdmin) return;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: wa }, { data: prof }, { data: auth }] = await Promise.all([
          supabase
            .from('whatsapp_accounts')
            .select('id, phone_number, connection_type, is_active')
            .eq('user_id', userId)
            .order('created_at', { ascending: true }),
          supabase.from('profiles').select('full_name').eq('user_id', userId).maybeSingle(),
          supabase.functions.invoke('admin-get-users'),
        ]);

        setAccounts(wa || []);
        if (wa && wa.length > 0) setAccountId(wa[0].id);

        setTargetName(prof?.full_name || '');
        const list = (auth?.data?.users || auth?.users || []) as { id: string; email?: string }[];
        const match = list.find((u) => u.id === userId);
        setTargetEmail(match?.email || '');
      } catch (e) {
        console.error(e);
        toast.error('Error cargando datos del usuario');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, isAdmin]);

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Admin banner */}
      <div className="bg-destructive/10 border-b border-destructive/30 px-3 sm:px-4 py-2 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')} className="h-8 w-8 flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0" />
        <Badge variant="destructive" className="flex-shrink-0">MODO ADMIN</Badge>
        <span className="text-sm truncate">
          Viendo bandeja de <strong>{targetName || targetEmail || userId}</strong>
          {targetEmail && targetName && <span className="text-muted-foreground"> · {targetEmail}</span>}
        </span>
        {accounts.length > 1 && (
          <div className="ml-auto">
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setSelectedConv(null); }}>
              <SelectTrigger className="w-[200px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.phone_number} {a.connection_type === 'external' ? '(QR)' : '(Meta)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Este usuario no tiene cuentas de WhatsApp.
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-[360px] border-r border-border flex-col`}>
            <ConversationsList
              selectedConversationId={selectedConv?.id ?? null}
              onSelectConversation={(c) => { setSelectedConv(c); setShowMobileChat(true); }}
              whatsappAccountId={accountId}
              platform="whatsapp"
            />
          </div>
          {/* Chat */}
          <div className={`${showMobileChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
            <ChatWindow
              conversation={selectedConv}
              onBack={() => setShowMobileChat(false)}
              onConversationUpdated={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInbox;