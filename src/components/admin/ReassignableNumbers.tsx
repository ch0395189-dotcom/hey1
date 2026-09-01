import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Link2, RotateCcw, History, Search, ArrowDownWideNarrow, ArrowUpNarrowWide, MessageCircle, Copy, XCircle, Inbox, Trash2, RadioTower, CheckSquare, Square } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Normaliza a solo dígitos; WhatsApp requiere formato internacional sin "+"
const normalizeWaPhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  // Un número válido de WhatsApp tiene entre 8 y 15 dígitos (E.164)
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
};

interface WAAccount {
  id: string;
  phone_number: string;
  display_name: string | null;
  user_id: string;
  is_active: boolean;
  connection_type: string | null;
  quality_rating: string | null;
  quality_paused: boolean | null;
  updated_at: string;
}

interface SubRow {
  user_id: string;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  trial_end: string | null;
}

interface LogRow {
  id: string;
  whatsapp_account_id: string;
  phone_number: string | null;
  previous_user_id: string | null;
  new_user_id: string;
  performed_by: string;
  reason: string | null;
  created_at: string;
}

const INACTIVE_DAYS = 30;

const isGoodQuality = (q: string | null) =>
  q === null || q === "GREEN" || q === "green" || q === "UNKNOWN" || q === "" ;

const daysSince = (iso: string | null) => {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
};

export const ReassignableNumbers = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<WAAccount[]>([]);
  const [subs, setSubs] = useState<Record<string, SubRow>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [lastSignIn, setLastSignIn] = useState<Record<string, string | null>>({});
  const [emailToId, setEmailToId] = useState<Record<string, string>>({});
  const [targetEmail, setTargetEmail] = useState<Record<string, string>>({});
  const [targetReason, setTargetReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<LogRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortOldest, setSortOldest] = useState(true);
  const [metaStatus, setMetaStatus] = useState<Record<string, { status?: string; quality?: string | null; error?: string | null }>>({});
  const [checkingMeta, setCheckingMeta] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      setMyUserId(sessionData.session?.user?.id ?? null);

      const { data: accts, error } = await supabase
        .from("whatsapp_accounts")
        .select("id, phone_number, display_name, user_id, is_active, connection_type, quality_rating, quality_paused, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const list = (accts ?? []) as WAAccount[];
      setAccounts(list);

      const userIds = Array.from(new Set(list.map((a) => a.user_id))).filter(Boolean);
      if (userIds.length) {
        const [{ data: subRows }, { data: profs }] = await Promise.all([
          supabase
            .from("subscriptions")
            .select("user_id, plan, status, current_period_end, trial_end")
            .in("user_id", userIds),
          supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds),
        ]);
        const sMap: Record<string, SubRow> = {};
        (subRows ?? []).forEach((s: any) => { sMap[s.user_id] = s; });
        setSubs(sMap);
        const pMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { if (p.full_name) pMap[p.user_id] = p.full_name; });
        setProfiles(pMap);
      }

      try {
        const { data: usersResp } = await supabase.functions.invoke("admin-get-users");
        const users = (usersResp as { users?: Array<{ id: string; email: string | null; last_sign_in_at: string | null }> })?.users ?? [];
        const eMap: Record<string, string> = {};
        const lMap: Record<string, string | null> = {};
        const e2i: Record<string, string> = {};
        users.forEach((u) => {
          if (u.email) {
            eMap[u.id] = u.email;
            e2i[u.email.toLowerCase()] = u.id;
          }
          lMap[u.id] = u.last_sign_in_at ?? null;
        });
        setEmails(eMap);
        setLastSignIn(lMap);
        setEmailToId(e2i);
      } catch (e) {
        console.warn("emails fetch failed", e);
      }

      // Cargar historial de reasignaciones
      const { data: logs } = await (supabase as any)
        .from("whatsapp_reassignment_log")
        .select("id, whatsapp_account_id, phone_number, previous_user_id, new_user_id, performed_by, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setHistory((logs ?? []) as LogRow[]);
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "No se pudo cargar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Consulta el estado REAL en Meta (calidad y conectividad) de todas las cuentas
  const checkMeta = async (silent = false) => {
    setCheckingMeta(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-wa-meta-status");
      if (error) throw error;
      const map: Record<string, { status?: string; quality?: string | null; error?: string | null }> = {};
      (data?.results ?? []).forEach((r: any) => {
        map[r.id] = { status: r.status, quality: r.quality ?? null, error: r.error ?? null };
      });
      setMetaStatus(map);
      if (!silent) toast({ title: "Estado actualizado", description: "Se consultó el estado real en Meta" });
    } catch (e: any) {
      if (!silent) toast({ title: "Error", description: e.message ?? "No se pudo consultar Meta", variant: "destructive" });
    } finally {
      setCheckingMeta(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("admin-delete-user", {
        body: { userId: deleteTarget.userId },
      });
      if (error) throw error;
      toast({ title: "Usuario eliminado", description: deleteTarget.label });
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "No se pudo eliminar", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => { load().then(() => checkMeta(true)); }, []);


  // Calidad real: prioriza lo consultado en Meta, si no usa lo almacenado
  const effectiveQuality = (a: WAAccount): string | null => {
    const m = metaStatus[a.id]?.quality;
    const raw = (m ?? a.quality_rating ?? "") as string;
    const up = raw.toUpperCase().trim();
    if (!up) return null;
    return up;
  };

  const bucketOf = (a: WAAccount): "GREEN" | "UNKNOWN" | "NA" => {
    const q = effectiveQuality(a);
    if (q === "GREEN") return "GREEN";
    if (q === "UNKNOWN") return "UNKNOWN";
    return "NA";
  };

  const reassignable = useMemo(() => {
    const rows = accounts
      .filter((a) => !a.quality_paused && isGoodQuality(effectiveQuality(a)))
      .map((a) => {
        const sub = subs[a.user_id];
        const last = lastSignIn[a.user_id];
        const subExpired = !sub
          || sub.status === "canceled"
          || sub.status === "expired"
          || sub.status === "past_due"
          || (sub.current_period_end && new Date(sub.current_period_end) < new Date())
          || (sub.status === "trialing" && sub.trial_end && new Date(sub.trial_end) < new Date());
        const inactive = daysSince(last) >= INACTIVE_DAYS;
        const reasons: string[] = [];
        if (subExpired) {
          let expiredDays: number | null = null;
          if (sub?.current_period_end) {
            expiredDays = Math.floor(daysSince(sub.current_period_end));
          } else if (sub?.status === "trialing" && sub?.trial_end) {
            expiredDays = Math.floor(daysSince(sub.trial_end));
          }
          if (expiredDays !== null && Number.isFinite(expiredDays) && expiredDays >= 0) {
            reasons.push(`Plan vencido hace ${expiredDays}d`);
          } else if (!sub) {
            reasons.push("Sin plan");
          } else {
            reasons.push(`Plan ${sub.status}`);
          }
        }
        if (inactive) reasons.push(`Sin login ${Math.floor(daysSince(last))}d`);

        // Inactivity score: días desde el vencimiento del plan (si aplica), si no, días desde último login.
        let planExpiredDays = -Infinity;
        if (sub?.current_period_end && new Date(sub.current_period_end) < new Date()) {
          planExpiredDays = daysSince(sub.current_period_end);
        } else if (sub?.status === "trialing" && sub?.trial_end && new Date(sub.trial_end) < new Date()) {
          planExpiredDays = daysSince(sub.trial_end);
        } else if (!sub || sub.status === "canceled" || sub.status === "past_due") {
          planExpiredDays = 0;
        }
        const loginDays = last ? daysSince(last) : Infinity;
        // Usamos el máximo entre vencimiento del plan y último login como métrica de inactividad
        const inactivityDays = Math.max(planExpiredDays === -Infinity ? 0 : planExpiredDays, loginDays);
        return { account: a, reasons, eligible: reasons.length > 0, inactivityDays };
      })
      .filter((x) => x.eligible);

    // Buscar por número, nombre, email o plan
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((x) => {
          const a = x.account;
          const ownerEmail = emails[a.user_id] ?? "";
          const ownerName = profiles[a.user_id] ?? "";
          const sub = subs[a.user_id];
          return (
            (a.phone_number || "").toLowerCase().includes(q) ||
            (a.display_name || "").toLowerCase().includes(q) ||
            ownerEmail.toLowerCase().includes(q) ||
            ownerName.toLowerCase().includes(q) ||
            (sub?.plan || "").toLowerCase().includes(q) ||
            (sub?.status || "").toLowerCase().includes(q)
          );
        })
      : rows;

    // Ordenar: por defecto de mayor a menor inactividad (más antiguo primero)
    filtered.sort((a, b) =>
      sortOldest ? b.inactivityDays - a.inactivityDays : a.inactivityDays - b.inactivityDays
    );
    return filtered;
  }, [accounts, subs, lastSignIn, search, sortOldest, emails, profiles, metaStatus]);

  const groups = useMemo(() => {
    const g: Record<"GREEN" | "UNKNOWN" | "NA", typeof reassignable> = { GREEN: [], UNKNOWN: [], NA: [] };
    reassignable.forEach((r) => { g[bucketOf(r.account)].push(r); });
    return g;
  }, [reassignable, metaStatus]);


  const reassign = async (accountId: string, newUserId: string | null) => {
    if (!newUserId) {
      toast({ title: "Falta destino", description: "Indica un email válido o usa 'Asignar a mí'", variant: "destructive" });
      return;
    }
    const reason = (targetReason[accountId] ?? "").trim();
    if (!reason) {
      toast({ title: "Falta motivo", description: "Indica un motivo para la reasignación", variant: "destructive" });
      return;
    }
    setBusy(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reassign-whatsapp", {
        body: { whatsapp_account_id: accountId, new_user_id: newUserId, reason },
      });
      if (error) throw error;
      const resp = data as { ok?: boolean; error?: string };
      if (!resp?.ok) throw new Error(resp?.error || "Error reasignando");
      toast({ title: "Reasignado", description: "Cuenta reasignada correctamente" });
      setTargetReason((s) => ({ ...s, [accountId]: "" }));
      setTargetEmail((s) => ({ ...s, [accountId]: "" }));
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "No se pudo reasignar", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const subLabel = (userId: string) => {
    const sub = subs[userId];
    if (!sub) return { text: "Sin suscripción", variant: "destructive" as const };
    const end = sub.status === "trialing" ? sub.trial_end : sub.current_period_end;
    const expired = end ? new Date(end) < new Date() : false;
    const dateTxt = end ? new Date(end).toLocaleDateString() : "sin fecha";
    return {
      text: `${sub.plan ?? "—"} · ${sub.status ?? "—"} · ${expired ? "vencido" : "vence"} ${dateTxt}`,
      variant: (expired || sub.status !== "active" ? "destructive" : "secondary") as "destructive" | "secondary",
    };
  };

  const renderTable = (rows: typeof reassignable) => {
    if (rows.length === 0) {
      return <p className="text-sm text-muted-foreground py-8 text-center">No hay números en este estado.</p>;
    }
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Calidad</TableHead>
              <TableHead>Dueño actual</TableHead>
              <TableHead>Suscripción</TableHead>
              <TableHead>Inactividad / Motivo</TableHead>
              <TableHead>Acciones</TableHead>
              <TableHead className="min-w-[280px]">Reasignar a</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ account: a, reasons, inactivityDays }) => {
              const ownerEmail = emails[a.user_id];
              const ownerName = profiles[a.user_id];
              const inputEmail = (targetEmail[a.id] ?? "").trim().toLowerCase();
              const resolvedId = inputEmail ? emailToId[inputEmail] : null;
              const inactLabel = Number.isFinite(inactivityDays) ? `${Math.floor(inactivityDays)}d` : "—";
              const quality = effectiveQuality(a);
              const meta = metaStatus[a.id];
              const sl = subLabel(a.user_id);
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.display_name || a.phone_number}</div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-2 hover:underline cursor-pointer text-left"
                          title="Tocar para escribir por WhatsApp"
                        >
                          {a.phone_number}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        {(() => {
                          const wa = normalizeWaPhone(a.phone_number);
                          if (!wa) {
                            return (
                              <div className="flex items-start gap-2 text-sm text-destructive">
                                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                  <p className="font-medium">No tiene WhatsApp</p>
                                  <p className="text-xs text-muted-foreground">El número no tiene un formato válido.</p>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="flex flex-col gap-2">
                              <p className="text-sm font-medium flex items-center gap-2">
                                <MessageCircle className="h-4 w-4 text-green-600" /> Tiene WhatsApp
                              </p>
                              <Button
                                size="sm"
                                className="w-full"
                                onClick={() => window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer")}
                              >
                                <MessageCircle className="h-4 w-4 mr-2" /> Escribir por WhatsApp
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                  navigator.clipboard.writeText(`+${wa}`).catch(() => {});
                                  toast({ title: "Copiado", description: `+${wa}` });
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" /> Copiar número
                              </Button>
                            </div>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
                    <div className="text-xs text-muted-foreground">{a.connection_type || "meta"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={quality === "GREEN" ? "border-green-600 text-green-700" : ""}
                    >
                      {quality ?? "N/A"}
                    </Badge>
                    {meta?.status && (
                      <div className="text-xs text-muted-foreground mt-1">{meta.status}</div>
                    )}
                    {meta?.error && (
                      <div className="text-xs text-destructive mt-1 max-w-[160px] break-words">{meta.error}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{ownerName || ownerEmail || a.user_id.slice(0, 8)}</div>
                    {ownerEmail && ownerName && <div className="text-xs text-muted-foreground">{ownerEmail}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sl.variant} className="whitespace-normal text-left">{sl.text}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit">{inactLabel}</Badge>
                      {reasons.map((r) => (
                        <Badge key={r} variant="secondary" className="w-fit">{r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/admin/inbox/${a.user_id}`)}>
                        <Inbox className="w-4 h-4 mr-1" /> Bandeja
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setDeleteTarget({ userId: a.user_id, label: ownerEmail || ownerName || a.user_id.slice(0, 8) })
                        }
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Eliminar usuario
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="email del nuevo dueño"
                          value={targetEmail[a.id] ?? ""}
                          onChange={(e) => setTargetEmail((s) => ({ ...s, [a.id]: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => reassign(a.id, resolvedId)}
                          disabled={busy === a.id || !resolvedId}
                        >
                          {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        </Button>
                      </div>
                      <Input
                        placeholder="motivo (requerido)"
                        value={targetReason[a.id] ?? ""}
                        onChange={(e) => setTargetReason((s) => ({ ...s, [a.id]: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      {inputEmail && !resolvedId && (
                        <p className="text-xs text-destructive">Email no encontrado</p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reassign(a.id, myUserId)}
                        disabled={busy === a.id || !myUserId}
                      >
                        Asignar a mí
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" /> Números reasignables</CardTitle>
            <CardDescription>
              Números no pausados cuyo dueño tiene el plan vencido o no inicia sesión hace {INACTIVE_DAYS}+ días.
              Divididos por su estado real de calidad en Meta.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => checkMeta(false)} disabled={checkingMeta}>
              {checkingMeta ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RadioTower className="w-4 h-4 mr-2" />}
              Verificar estado real
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-2" /> Recargar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, nombre, email o plan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOldest((s) => !s)}
            title={sortOldest ? "Ordenado: más antiguo primero" : "Ordenado: más reciente primero"}
          >
            {sortOldest ? <ArrowDownWideNarrow className="w-4 h-4 mr-1" /> : <ArrowUpNarrowWide className="w-4 h-4 mr-1" />}
            {sortOldest ? "Más antiguo" : "Más reciente"}
          </Button>
          <Badge variant="secondary">{reassignable.length}</Badge>
        </div>

        <Tabs defaultValue="UNKNOWN">
          <TabsList>
            <TabsTrigger value="UNKNOWN">UNKNOWN ({groups.UNKNOWN.length})</TabsTrigger>
            <TabsTrigger value="NA">N/A ({groups.NA.length})</TabsTrigger>
            <TabsTrigger value="GREEN">GREEN ({groups.GREEN.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="UNKNOWN">{renderTable(groups.UNKNOWN)}</TabsContent>
          <TabsContent value="NA">{renderTable(groups.NA)}</TabsContent>
          <TabsContent value="GREEN">{renderTable(groups.GREEN)}</TabsContent>
        </Tabs>


        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-5 w-5" />
            <h3 className="font-semibold">Historial de reasignaciones</h3>
            <Badge variant="secondary">{history.length}</Badge>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aún no hay reasignaciones registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>A</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(h.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">{h.phone_number || h.whatsapp_account_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">
                        {h.previous_user_id ? (emails[h.previous_user_id] || profiles[h.previous_user_id] || h.previous_user_id.slice(0, 8)) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {emails[h.new_user_id] || profiles[h.new_user_id] || h.new_user_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {emails[h.performed_by] || profiles[h.performed_by] || h.performed_by.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[260px] whitespace-normal break-words">
                        {h.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente {deleteTarget?.label} y todos sus datos asociados
              (conversaciones, cuentas, pagos). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); deleteUser(); }} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};