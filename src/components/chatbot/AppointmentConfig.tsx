import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { CalendarDays, Calendar, Plus, X, MessageSquarePlus, ArrowUp, ArrowDown } from 'lucide-react';

export interface AppointmentCustomStep {
  id: string;
  label: string;
  question: string;
  options: string[];
}

export interface AppointmentSettings {
  enabled: boolean;
  ask_name: boolean;
  ask_phone: boolean;
  ask_birthdate: boolean;
  ask_date: boolean;
  ask_time: boolean;
  ask_photo?: boolean;
  photo_question?: string;
  confirmation_message: string;
  available_days: string; // e.g. "lun,mar,mié,jue,vie"
  available_hours: string; // e.g. "9:00-18:00"
  sync_google_calendar: boolean;
  duration_minutes: number;
  custom_steps?: AppointmentCustomStep[];
  /** Orden global de las preguntas (claves base + custom_<id>) */
  step_order?: string[];
}

export const defaultAppointmentSettings: AppointmentSettings = {
  enabled: false,
  ask_name: true,
  ask_phone: true,
  ask_birthdate: true,
  ask_date: true,
  ask_time: true,
  ask_photo: false,
  photo_question: '📸 Por favor envía una *foto* para completar tu cita.',
  confirmation_message: '✅ Tu cita ha sido agendada para el {fecha} a las {hora}. ¡Te esperamos!',
  available_days: 'lun,mar,mié,jue,vie',
  available_hours: '9:00-18:00',
  sync_google_calendar: false,
  duration_minutes: 60,
  custom_steps: [],
  step_order: [],
};

const BASE_STEPS: { key: string; label: string; flag: keyof AppointmentSettings }[] = [
  { key: 'customer_name', label: 'Nombre', flag: 'ask_name' },
  { key: 'customer_phone', label: 'Teléfono', flag: 'ask_phone' },
  { key: 'birth_date', label: 'Fecha de nacimiento', flag: 'ask_birthdate' },
  { key: 'appointment_date', label: 'Fecha de la cita', flag: 'ask_date' },
  { key: 'appointment_time', label: 'Hora de la cita', flag: 'ask_time' },
  { key: 'photo_url', label: 'Foto', flag: 'ask_photo' },
];

/** Devuelve el orden efectivo de todas las preguntas (base + personalizadas). */
export function resolveStepOrder(settings: AppointmentSettings): string[] {
  const all = [
    ...BASE_STEPS.map((s) => s.key),
    ...(settings.custom_steps || []).map((c, i) => `custom_${c.id || i}`),
  ];
  const saved = (settings.step_order || []).filter((k) => all.includes(k));
  return [...saved, ...all.filter((k) => !saved.includes(k))];
}

interface AppointmentConfigProps {
  settings: AppointmentSettings;
  onChange: (settings: AppointmentSettings) => void;
}

export const AppointmentConfig = ({ settings, onChange }: AppointmentConfigProps) => {
  const update = (key: keyof AppointmentSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  const customSteps: AppointmentCustomStep[] = settings.custom_steps || [];

  const updateStep = (index: number, patch: Partial<AppointmentCustomStep>) => {
    const next = customSteps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    update('custom_steps', next);
  };

  const addStep = () => {
    update('custom_steps', [
      ...customSteps,
      { id: `cs_${Date.now()}`, label: '', question: '', options: [] },
    ]);
  };

  const removeStep = (index: number) => {
    update('custom_steps', customSteps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= customSteps.length) return;
    const next = [...customSteps];
    [next[index], next[target]] = [next[target], next[index]];
    update('custom_steps', next);
  };

  const updateOption = (stepIndex: number, optIndex: number, value: string) => {
    const opts = [...(customSteps[stepIndex].options || [])];
    opts[optIndex] = value;
    updateStep(stepIndex, { options: opts });
  };

  const addOption = (stepIndex: number) => {
    const opts = [...(customSteps[stepIndex].options || [])];
    updateStep(stepIndex, { options: [...opts, ''] });
  };

  const removeOption = (stepIndex: number, optIndex: number) => {
    const opts = (customSteps[stepIndex].options || []).filter((_, i) => i !== optIndex);
    updateStep(stepIndex, { options: opts });
  };

  const moveOption = (stepIndex: number, optIndex: number, direction: -1 | 1) => {
    const opts = [...(customSteps[stepIndex].options || [])];
    const target = optIndex + direction;
    if (target < 0 || target >= opts.length) return;
    [opts[optIndex], opts[target]] = [opts[target], opts[optIndex]];
    updateStep(stepIndex, { options: opts });
  };

  const order = resolveStepOrder(settings);
  const labelForKey = (key: string) => {
    const base = BASE_STEPS.find((b) => b.key === key);
    if (base) return base.label;
    const custom = (settings.custom_steps || []).find(
      (c, i) => `custom_${c.id || i}` === key
    );
    return custom ? (custom.label || custom.question || 'Pregunta personalizada') : key;
  };
  const isActiveKey = (key: string) => {
    const base = BASE_STEPS.find((b) => b.key === key);
    if (base) {
      return base.flag === 'ask_photo'
        ? !!settings.ask_photo
        : (settings[base.flag] as boolean) !== false;
    }
    const custom = (settings.custom_steps || []).find(
      (c, i) => `custom_${c.id || i}` === key
    );
    return !!custom?.question?.trim();
  };
  const moveOrder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    update('step_order', next);
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
          <Label className="text-sm">Pedir fecha de nacimiento</Label>
          <Switch checked={settings.ask_birthdate} onCheckedChange={(v) => update('ask_birthdate', v)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir fecha</Label>
          <Switch checked={settings.ask_date} onCheckedChange={(v) => update('ask_date', v)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir hora</Label>
          <Switch checked={settings.ask_time} onCheckedChange={(v) => update('ask_time', v)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Pedir foto</Label>
          <Switch checked={!!settings.ask_photo} onCheckedChange={(v) => update('ask_photo', v)} />
        </div>
      </div>

      {settings.ask_photo && (
        <div className="space-y-2">
          <Label className="text-sm">Mensaje para pedir la foto</Label>
          <Textarea
            value={settings.photo_question ?? defaultAppointmentSettings.photo_question}
            onChange={(e) => update('photo_question', e.target.value)}
            placeholder="📸 Por favor envía una foto..."
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            El cliente debe responder con una imagen; el enlace de la foto se guarda en las notas de la cita.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">Días disponibles</Label>
</div>

      {/* Orden global de las preguntas */}
      <div className="rounded-lg border bg-background/50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <ArrowUpDown className="h-4 w-4" />
          <h5 className="text-sm font-semibold">Orden de las preguntas</h5>
        </div>
        <p className="text-xs text-muted-foreground">
          Usa las flechas para definir en qué orden el bot hará cada pregunta. Las desactivadas no se envían.
        </p>
        {order.map((key, index) => (
          <div key={key} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground w-5">{index + 1}.</span>
            <span className={`flex-1 text-sm ${isActiveKey(key) ? '' : 'text-muted-foreground line-through'}`}>
              {labelForKey(key)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === 0}
              onClick={() => moveOrder(index, -1)}
              aria-label="Subir paso"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === order.length - 1}
              onClick={() => moveOrder(index, 1)}
              aria-label="Bajar paso"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        ))}
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
          Variables: {'{nombre}'}, {'{fecha}'}, {'{hora}'}, {'{telefono}'}, {'{nacimiento}'}
        </p>
      </div>

      {/* Preguntas y botones personalizados */}
      <div className="rounded-lg border bg-background/50 p-3 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <MessageSquarePlus className="h-4 w-4" />
          <h5 className="text-sm font-semibold">Preguntas y botones personalizados</h5>
        </div>
        <p className="text-xs text-muted-foreground">
          Agrega preguntas libres (ej. "¿Qué servicio deseas?") con los botones de respuesta que necesites.
          Las respuestas quedan guardadas en las notas de la cita.
        </p>
        <p className="text-xs text-muted-foreground">
          Usa las flechas para reorganizar el orden de las preguntas y de los botones.
        </p>

        {customSteps.map((step, index) => (
          <div key={step.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Pregunta {index + 1}</span>
                </div>
                <Input
                  value={step.label}
                  onChange={(e) => updateStep(index, { label: e.target.value })}
                  placeholder="Nombre del campo (ej. Servicio)"
                />
                <Textarea
                  value={step.question}
                  onChange={(e) => updateStep(index, { question: e.target.value })}
                  placeholder="Pregunta que verá el cliente"
                  rows={2}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  onClick={() => moveStep(index, -1)}
                  aria-label="Subir pregunta"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === customSteps.length - 1}
                  onClick={() => moveStep(index, 1)}
                  aria-label="Bajar pregunta"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeStep(index)} aria-label="Eliminar pregunta">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Botones de respuesta (opcional, sin límite)</Label>
              {(step.options || []).map((opt, optIndex) => (
                <div key={optIndex} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(index, optIndex, e.target.value)}
                    placeholder={`Botón ${optIndex + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={optIndex === 0}
                    onClick={() => moveOption(index, optIndex, -1)}
                    aria-label="Subir botón"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={optIndex === (step.options || []).length - 1}
                    onClick={() => moveOption(index, optIndex, 1)}
                    aria-label="Bajar botón"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index, optIndex)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addOption(index)}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar botón
              </Button>
              {(step.options || []).length > 3 && (
                <p className="text-xs text-muted-foreground">
                  Con más de 3 opciones WhatsApp las muestra como lista desplegable (hasta 10); si son más de 10 se envían numeradas en texto.
                </p>
              )}
              {(step.options || []).length === 0 && (
                <p className="text-xs text-muted-foreground">Sin botones, el cliente responde con texto libre.</p>
              )}
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addStep}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar pregunta
        </Button>
      </div>

      <div className="rounded-lg border bg-background/50 p-3 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <Calendar className="h-4 w-4" />
          <h5 className="text-sm font-semibold">Sincronización con Google Calendar</h5>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">Crear eventos en Google Calendar</Label>
          <Switch
            checked={settings.sync_google_calendar}
            onCheckedChange={(v) => update('sync_google_calendar', v)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Duración de cada cita (minutos)</Label>
          <Input
            type="number"
            min={5}
            max={480}
            value={settings.duration_minutes}
            onChange={(e) => update('duration_minutes', Math.max(5, parseInt(e.target.value || '0', 10)))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          El usuario debe conectar su Google Calendar desde la pestaña Citas.
        </p>
      </div>
    </div>
  );
};
