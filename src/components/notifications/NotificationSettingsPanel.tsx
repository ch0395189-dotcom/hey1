import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Volume2, Bell, Play } from "lucide-react";
import { NotificationTone } from "@/hooks/useNotificationSettings";
import { useNotificationSound } from "@/hooks/useNotificationSound";

interface NotificationSettingsPanelProps {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  volume: number;
  tone: NotificationTone;
  desktopPermission: NotificationPermission | 'default';
  onToggleSound: () => void;
  onToggleDesktop: () => void;
  onVolumeChange: (volume: number) => void;
  onToneChange: (tone: NotificationTone) => void;
  onRequestDesktopPermission: () => void;
}

const toneLabels: Record<NotificationTone, string> = {
  chime: '🎵 Campanita',
  ping: '🔔 Ping',
  bubble: '💧 Burbuja',
  bell: '🔔 Campana',
  soft: '🌙 Suave',
  alarm: '🚨 Alarma',
};

export const NotificationSettingsPanel = ({
  soundEnabled,
  desktopEnabled,
  volume,
  tone,
  desktopPermission,
  onToggleSound,
  onToggleDesktop,
  onVolumeChange,
  onToneChange,
  onRequestDesktopPermission,
}: NotificationSettingsPanelProps) => {
  const { playPreview } = useNotificationSound();

  const handlePreview = () => {
    playPreview(volume, tone);
  };

  return (
    <div className="space-y-6 p-1">
      {/* Sound Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Volume2 className="w-4 h-4" />
          Sonido de notificación
        </div>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="sound-toggle" className="text-sm text-muted-foreground">
            Activar sonido
          </Label>
          <Switch
            id="sound-toggle"
            checked={soundEnabled}
            onCheckedChange={onToggleSound}
          />
        </div>

        {soundEnabled && (
          <>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tono</Label>
              <div className="flex gap-2">
                <Select value={tone} onValueChange={(v) => onToneChange(v as NotificationTone)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(toneLabels) as NotificationTone[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {toneLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePreview}
                  title="Escuchar tono"
                >
                  <Play className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Volumen</Label>
                <span className="text-xs text-muted-foreground">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <Slider
                value={[volume]}
                onValueChange={([v]) => onVolumeChange(v)}
                max={1}
                min={0.1}
                step={0.1}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>

      {/* Desktop Notifications */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bell className="w-4 h-4" />
          Notificaciones de escritorio
        </div>

        {desktopPermission !== 'granted' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Permite notificaciones para recibir alertas cuando no estés en la pestaña.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRequestDesktopPermission}
              className="w-full"
            >
              Activar notificaciones
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Label htmlFor="desktop-toggle" className="text-sm text-muted-foreground">
              Mostrar notificaciones
            </Label>
            <Switch
              id="desktop-toggle"
              checked={desktopEnabled}
              onCheckedChange={onToggleDesktop}
            />
          </div>
        )}
      </div>
    </div>
  );
};
