import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link2, CheckCircle2, RefreshCw } from "lucide-react";

interface WAAccount {
  id: string;
  phone_number: string;
  display_name: string | null;
  user_id: string;
  is_active: boolean;
  connection_type: string | null;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
}

export const MyWhatsAppAccounts = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<WAAccount[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id ?? null;
      const email = sessionData.session?.user?.email ?? null;
      setMyUserId(uid);
      setMyEmail(email);

      const { data: accts, error: acctsErr } = await supabase
        .from("whatsapp_accounts")
        .select("id, phone_number, display_name, user_id, is_active, connection_type")
        .order("updated_at", { ascending: false });
      if (acctsErr) throw acctsErr;
      const list = (accts ?? []) as WAAccount[];
      setAccounts(list);

      const userIds = Array.from(new Set(list.map((a) => a.user_id))).filter(Boolean);
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        const map: Record<string, string> = {};
        (profs as ProfileRow[] | null)?.forEach((p) => {
          if (p.full_name) map[p.user_id] = p.full_name;
        });
        setProfiles(map);
      }

      // Fetch emails via admin edge function
      try {
        const { data: usersResp } = await supabase.functions.invoke("admin-get-users");
        const emailMap: Record<string, string> = {};
        const users = (usersResp as { users?: Array<{ id: string; email: string | null }> })?.users ?? [];
        users.forEach((u) => { if (u.email) emailMap[u.id] = u.email; });
        setEmails(emailMap);
      } catch (e) {
        console.warn("No se pudieron cargar emails:", e);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "No se pudo cargar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reassign = async (accountId: string) => {
    if (!myUserId) return;
    setReassigning(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reassign-whatsapp", {
        body: { whatsapp_account_id: accountId, new_user_id: myUserId },
      });
      if (error) throw error;
      const resp = data as { ok?: boolean; error?: string };
      if (!resp?.ok) throw new Error(resp?.error || "Error reasignando");
      toast({ title: "Cuenta asociada", description: "Ahora está vinculada a tu usuario admin." });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "No se pudo reasignar", variant: "destructive" });
    } finally {
      setReassigning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mine = accounts.filter((a) => a.user_id === myUserId);
  const others = accounts.filter((a) => a.user_id !== myUserId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Mis cuentas de WhatsApp
            </CardTitle>
            <CardDescription>
              Asocia explícitamente cuentas de WhatsApp a tu usuario admin{myEmail ? ` (${myEmail})` : ""} para evitar que se priorice otra.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" /> Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <section>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Cuentas asociadas a mí ({mine.length})
          </h3>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes cuentas asociadas.</p>
          ) : (
            <ul className="space-y-2">
              {mine.map((a) => (
                <li key={a.id} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.display_name || a.phone_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.phone_number}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.connection_type && <Badge variant="outline">{a.connection_type}</Badge>}
                    {a.is_active ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold mb-3">Otras cuentas en el sistema ({others.length})</h3>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay otras cuentas.</p>
          ) : (
            <ul className="space-y-2">
              {others.map((a) => {
                const ownerName = profiles[a.user_id];
                const ownerEmail = emails[a.user_id];
                return (
                  <li key={a.id} className="border rounded-md p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.display_name || a.phone_number}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.phone_number} · Dueño actual: {ownerName || ownerEmail || a.user_id.slice(0, 8)}
                        {ownerEmail && ownerName ? ` (${ownerEmail})` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => reassign(a.id)}
                      disabled={reassigning === a.id || !myUserId}
                    >
                      {reassigning === a.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4 mr-2" />
                      )}
                      Asociar a mí
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
};