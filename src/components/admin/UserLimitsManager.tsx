import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAll';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Save, RotateCcw, Search, SlidersHorizontal, Plus } from 'lucide-react';

interface Row {
  user_id: string;
  email: string;
  full_name: string | null;
  plan: string | null;
  agents_count: number;
  wa_count: number;
  max_agents: number | null;
  max_whatsapp_accounts: number | null;
  max_messages: number | null;
}

interface Draft {
  agents: string;
  wa: string;
  messages: string;
}

export const UserLimitsManager = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [profiles, { data: subs }, { data: accounts }, { data: agents }, { data: overrides }, { data: authData }] =
        await Promise.all([
          fetchAllRows<{ user_id: string; full_name: string | null }>('profiles', 'user_id, full_name'),
          supabase.from('subscriptions').select('user_id, plan'),
          supabase.from('whatsapp_accounts').select('user_id, is_active'),
          supabase.from('team_agents').select('owner_id, is_active'),
          (supabase as any).from('user_limit_overrides').select('user_id, max_agents, max_whatsapp_accounts, max_messages'),
          supabase.functions.invoke('admin-get-users'),
        ]);

      const emailMap = new Map<string, string>();
      const list = ((authData as any)?.data?.users || (authData as any)?.users || []) as { id: string; email?: string }[];
      list.forEach((u) => { if (u.id && u.email) emailMap.set(u.id, u.email); });

      const planMap = new Map((subs || []).map((s: any) => [s.user_id, s.plan as string]));
      const waMap = new Map<string, number>();
      (accounts || []).forEach((a: any) => {
        if (!a.is_active) return;
        waMap.set(a.user_id, (waMap.get(a.user_id) || 0) + 1);
      });
      const agentMap = new Map<string, number>();
      (agents || []).forEach((a: any) => {
        if (!a.is_active) return;
        agentMap.set(a.owner_id, (agentMap.get(a.owner_id) || 0) + 1);
      });
      const ovMap = new Map<string, any>(((overrides as any[]) || []).map((o) => [o.user_id, o]));

      const built: Row[] = (profiles || []).map((p: any) => {
        const ov = ovMap.get(p.user_id);
        return {
          user_id: p.user_id,
          email: emailMap.get(p.user_id) || 'N/A',
          full_name: p.full_name,
          plan: planMap.get(p.user_id) ?? null,
          agents_count: agentMap.get(p.user_id) || 0,
          wa_count: waMap.get(p.user_id) || 0,
          max_agents: ov?.max_agents ?? null,
          max_whatsapp_accounts: ov?.max_whatsapp_accounts ?? null,
          max_messages: ov?.max_messages ?? null,
        };
      });

      built.sort((a, b) => (b.max_agents ? 1 : 0) - (a.max_agents ? 1 : 0) || a.email.localeCompare(b.email));
      setRows(built);
    } catch (e) {
      toast({ title: 'Error cargando usuarios', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows.slice(0, 50);
    return rows.filter((r) => r.email.toLowerCase().includes(q) || (r.full_name || '').toLowerCase().includes(q)).slice(0, 50);
  }, [rows, search]);

  const draftFor = (r: Row): Draft =>
    drafts[r.user_id] ?? {
      agents: r.max_agents != null ? String(r.max_agents) : '',
      wa: r.max_whatsapp_accounts != null ? String(r.max_whatsapp_accounts) : '',
      messages: r.max_messages != null ? String(r.max_messages) : '',
    };

  const setDraft = (userId: string, patch: Partial<Draft>, base: Draft) => {
    setDrafts((prev) => ({ ...prev, [userId]: { ...base, ...patch } }));
  };

  const parse = (v: string) => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };

  const persist = async (r: Row, payload: { max_agents: number | null; max_whatsapp_accounts: number | null; max_messages: number | null }) => {
    setSavingId(r.user_id);
    try {
      const { error } = await (supabase as any)
        .from('user_limit_overrides')
        .upsert({ user_id: r.user_id, ...payload }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Límites actualizados', description: r.email });
      setDrafts((prev) => { const n = { ...prev }; delete n[r.user_id]; return n; });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const save = async (r: Row) => {
    const d = draftFor(r);
    await persist(r, {
      max_agents: parse(d.agents),
      max_whatsapp_accounts: parse(d.wa),
      max_messages: parse(d.messages),
    });
  };

  /** Suma cupos manualmente partiendo del uso actual si aún no hay override. */
  const bump = async (r: Row, field: 'agents' | 'wa', delta: number) => {
    const d = draftFor(r);
    const currentAgents = parse(d.agents) ?? r.max_agents ?? r.agents_count;
    const currentWa = parse(d.wa) ?? r.max_whatsapp_accounts ?? r.wa_count;
    await persist(r, {
      max_agents: field === 'agents' ? Math.max(0, currentAgents + delta) : currentAgents,
      max_whatsapp_accounts: field === 'wa' ? Math.max(0, currentWa + delta) : currentWa,
      max_messages: parse(d.messages) ?? r.max_messages,
    });
  };


  const reset = async (r: Row) => {
    setSavingId(r.user_id);
    try {
      const { error } = await (supabase as any).from('user_limit_overrides').delete().eq('user_id', r.user_id);
      if (error) throw error;
      toast({ title: 'Límites del plan restaurados', description: r.email });
      setDrafts((prev) => { const n = { ...prev }; delete n[r.user_id]; return n; });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo restaurar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          <CardTitle>Ampliar límites por usuario</CardTitle>
        </div>
        <CardDescription>
          Define cupos personalizados de agentes, cuentas de WhatsApp y mensajes mensuales.
          Deja el campo vacío para usar el límite del plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No se encontraron usuarios.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const d = draftFor(r);
              const custom = r.max_agents != null || r.max_whatsapp_accounts != null || r.max_messages != null;
              return (
                <div key={r.user_id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.email}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.full_name || 'Sin nombre'} · {r.agents_count} agente(s) · {r.wa_count} WhatsApp
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.plan && <Badge variant="secondary">{r.plan}</Badge>}
                      {custom && <Badge>Personalizado</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Máx. agentes</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Plan"
                        value={d.agents}
                        onChange={(e) => setDraft(r.user_id, { agents: e.target.value }, d)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Máx. cuentas WhatsApp</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Plan"
                        value={d.wa}
                        onChange={(e) => setDraft(r.user_id, { wa: e.target.value }, d)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Máx. mensajes / mes</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Plan"
                        value={d.messages}
                        onChange={(e) => setDraft(r.user_id, { messages: e.target.value }, d)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => save(r)} disabled={savingId === r.user_id}>
                      {savingId === r.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span className="ml-2">Guardar</span>
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => bump(r, 'agents', 1)} disabled={savingId === r.user_id}>
                      <Plus className="h-4 w-4" />
                      <span className="ml-1">1 agente</span>
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => bump(r, 'agents', 5)} disabled={savingId === r.user_id}>
                      <Plus className="h-4 w-4" />
                      <span className="ml-1">5 agentes</span>
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => bump(r, 'wa', 1)} disabled={savingId === r.user_id}>
                      <Plus className="h-4 w-4" />
                      <span className="ml-1">1 WhatsApp</span>
                    </Button>

                    {custom && (
                      <Button size="sm" variant="outline" onClick={() => reset(r)} disabled={savingId === r.user_id}>
                        <RotateCcw className="h-4 w-4" />
                        <span className="ml-2">Usar límites del plan</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
