import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BellRing, Loader2, Save } from 'lucide-react';

interface Account {
  id: string;
  phone_number: string;
  display_name: string | null;
}

interface Settings {
  notify_on_create: boolean;
  reminder_enabled: boolean;
  reminder_minutes: number;
  notify_phone: string;
  whatsapp_account_id: string;
}

const DEFAULTS: Settings = {
  notify_on_create: true,
  reminder_enabled: true,
  reminder_minutes: 60,
  notify_phone: '',
  whatsapp_account_id: '',
};

export const AppointmentRemindersCard = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }

    const [{ data: cfg }, { data: accs }] = await Promise.all([
      supabase.from('appointment_notification_settings').select('*').eq('user_id', uid).maybeSingle(),
      supabase
        .from('whatsapp_accounts')
        .select('id, phone_number, display_name')
        .eq('user_id', uid)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ]);

    setAccounts((accs ?? []) as Account[]);
    if (cfg) {
      setSettings({
        notify_on_create: cfg.notify_on_create,
        reminder_enabled: cfg.reminder_enabled,
        reminder_minutes: cfg.reminder_minutes,
        notify_phone: cfg.notify_phone ?? '',
        whatsapp_account_id: cfg.whatsapp_account_id ?? '',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      setSaving(false);
      return;
    }
    const { error } = await supabase.from('appointment_notification_settings').upsert(
      {
        user_id: uid,
        notify_on_create: settings.notify_on_create,
        reminder_enabled: settings.reminder_enabled,
        reminder_minutes: settings.reminder_minutes,
        notify_phone: settings.notify_phone.trim() || null,
        whatsapp_account_id: settings.whatsapp_account_id || null,
      },
      { onConflict: 'user_id' },
    );
    setSaving(false);
    if (error) {
      toast({ title: 'No se pudo guardar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recordatorios guardados' });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <BellRing className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Avisos y recordatorios de citas</p>
          <p className="text-xs text-muted-foreground">
            Recibe una notificación cuando un cliente agende y un recordatorio antes de la cita.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5">
              <Label htmlFor="notify-create" className="text-sm font-normal">
                Avisarme cuando agenden una cita
              </Label>
              <Switch
                id="notify-create"
                checked={settings.notify_on_create}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_on_create: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5">
              <Label htmlFor="notify-reminder" className="text-sm font-normal">
                Recordarme antes de la cita
              </Label>
              <Switch
                id="notify-reminder"
                checked={settings.reminder_enabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, reminder_enabled: v }))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Antelación</Label>
              <Select
                value={String(settings.reminder_minutes)}
                onValueChange={(v) => setSettings((s) => ({ ...s, reminder_minutes: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos antes</SelectItem>
                  <SelectItem value="30">30 minutos antes</SelectItem>
                  <SelectItem value="60">1 hora antes</SelectItem>
                  <SelectItem value="120">2 horas antes</SelectItem>
                  <SelectItem value="1440">1 día antes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mi WhatsApp para avisos</Label>
              <Input
                value={settings.notify_phone}
                onChange={(e) => setSettings((s) => ({ ...s, notify_phone: e.target.value }))}
                placeholder="573001234567"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Enviar desde</Label>
              <Select
                value={settings.whatsapp_account_id || 'auto'}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, whatsapp_account_id: v === 'auto' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name || a.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Siempre recibes la notificación push en la app. El aviso por WhatsApp solo se envía si
              escribes tu número aquí.
            </p>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Guardar
            </Button>
          </div>
        </>
      )}
    </div>
  );
};