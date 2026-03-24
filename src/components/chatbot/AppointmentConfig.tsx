import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { CalendarDays } from 'lucide-react';

export interface AppointmentSettings {
  enabled: boolean;
  ask_name: boolean;
  ask_phone: boolean;
  ask_date: boolean;
  ask_time: boolean;
  confirmation_message: string;
  available_days: string; // e.g. "lun,mar,mié,jue,vie"
  available_hours: string; // e.g. "9:00-18:00"
}

export const defaultAppointmentSettings: AppointmentSettings = {
  enabled: false,
  ask_name: true,
  ask_phone: true,
  ask_date: true,
  ask_time: true,
  confirmation_message: '✅ Tu cita ha sido agendada para el {fecha} a las {hora}. ¡Te esperamos!',
  available_days: 'lun,mar,mié,jue,vie',
  available_hours: '9:00-18:00',
};

interface AppointmentConfigProps {
  settings: AppointmentSettings;
  onChange: (settings: AppointmentSettings) => void;
}

export const AppointmentConfig = ({ settings, onChange }: AppointmentConfigProps) => {
  const update = (key: keyof AppointmentSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 text-primary">
        <CalendarDays className="h-5 w-5" />
        <h4 className="font-semibold">Configuración de Cita</h4>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir nombre</Label>
          <Switch checked={settings.ask_name} onCheckedChange={(v) => update('ask_name', v)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir teléfono</Label>
          <Switch checked={settings.ask_phone} onCheckedChange={(v) => update('ask_phone', v)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir fecha</Label>
          <Switch checked={settings.ask_date} onCheckedChange={(v) => update('ask_date', v)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir hora</Label>
          <Switch checked={settings.ask_time} onCheckedChange={(v) => update('ask_time', v)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Días disponibles</Label>
        <Input
          value={settings.available_days}
          onChange={(e) => update('available_days', e.target.value)}
          placeholder="lun,mar,mié,jue,vie"
        />
        <p className="text-xs text-muted-foreground">Separados por coma</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Horario disponible</Label>
        <Input
          value={settings.available_hours}
          onChange={(e) => update('available_hours', e.target.value)}
          placeholder="9:00-18:00"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Mensaje de confirmación</Label>
        <Textarea
          value={settings.confirmation_message}
          onChange={(e) => update('confirmation_message', e.target.value)}
          placeholder="Tu cita ha sido agendada..."
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Variables: {'{nombre}'}, {'{fecha}'}, {'{hora}'}, {'{telefono}'}
        </p>
      </div>
    </div>
  );
};
