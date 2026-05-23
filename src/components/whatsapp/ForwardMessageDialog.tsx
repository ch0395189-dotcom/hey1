import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyWhatsappError } from "@/lib/whatsappErrors";
import { Forward, Loader2, Search } from "lucide-react";

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: {
    content: string | null;
    media_url: string | null;
    message_type: string;
  } | null;
  sourceAccountId: string;
}

interface AccountRow {
  id: string;
  display_name: string | null;
  phone_number: string;
  connection_type: string | null;
}

interface ConvRow {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  whatsapp_account_id: string;
}

export const ForwardMessageDialog = ({
  open,
  onOpenChange,
  message,
  sourceAccountId,
}: ForwardMessageDialogProps) => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(sourceAccountId);
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedAccountId(sourceAccountId);
    setSearch("");
    setPhone("");
    (async () => {
      const [{ data: accs }, { data: convs }] = await Promise.all([
        supabase
          .from("whatsapp_accounts")
          .select("id, display_name, phone_number, connection_type")
          .eq("is_active", true),
        supabase
          .from("conversations")
          .select("id, customer_name, customer_phone, whatsapp_account_id")
          .order("last_message_at", { ascending: false })
          .limit(50),
      ]);
      setAccounts(accs || []);
      setConversations(convs || []);
    })();
  }, [open, sourceAccountId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!q) return true;
      return (
        (c.customer_name || "").toLowerCase().includes(q) ||
        c.customer_phone.includes(q)
      );
    });
  }, [conversations, search]);

  const sendTo = async (toPhone: string, accountId: string) => {
    if (!message) return;
    const account = accounts.find((a) => a.id === accountId);
    const isExternal =
      account?.connection_type === "external_qr" ||
      account?.connection_type === "z-api";
    const digits = toPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Número inválido", description: "Mínimo 10 dígitos.", variant: "destructive" });
      return;
    }

    const hasMedia = !!message.media_url;
    const mediaType = hasMedia ? (message.message_type as any) : undefined;

    if (isExternal) {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-external", {
        body: {
          accountId,
          to: digits,
          message: message.content || undefined,
          mediaUrl: message.media_url || undefined,
          mediaType,
          createConversation: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(getFriendlyWhatsappError(data));
    } else {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: {
          phone_number: digits,
          whatsapp_account_id: accountId,
          message: message.content || undefined,
          message_type: hasMedia ? mediaType : "text",
          media_url: message.media_url || undefined,
          media_type: mediaType,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(getFriendlyWhatsappError(data));
    }
  };

  const handleForwardToConv = async (conv: ConvRow) => {
    setSending(true);
    try {
      await sendTo(conv.customer_phone, conv.whatsapp_account_id);
      toast({ title: "Reenviado", description: `Mensaje enviado a ${conv.customer_name || conv.customer_phone}` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo reenviar", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleForwardToPhone = async () => {
    if (!phone.trim()) {
      toast({ title: "Número requerido", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await sendTo(phone, selectedAccountId);
      toast({ title: "Reenviado", description: `Mensaje enviado a ${phone}` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo reenviar", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const previewLabel = message?.media_url
    ? `📎 ${message.message_type}${message.content ? ` · ${message.content.slice(0, 40)}` : ""}`
    : (message?.content || "").slice(0, 80);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="w-5 h-5" /> Reenviar mensaje
          </DialogTitle>
          <DialogDescription className="truncate">{previewLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Buscar conversación</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nombre o número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-48 border rounded-md">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Sin resultados</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleForwardToConv(c)}
                    disabled={sending}
                    className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium truncate">
                      {c.customer_name || c.customer_phone}
                    </div>
                    {c.customer_name && (
                      <div className="text-xs text-muted-foreground">{c.customer_phone}</div>
                    )}
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label>O enviar a un número nuevo</Label>
            {accounts.length > 1 && (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger><SelectValue placeholder="Cuenta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name || a.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="573001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
                className="font-mono"
              />
              <Button onClick={handleForwardToPhone} disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
