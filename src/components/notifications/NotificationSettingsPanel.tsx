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
import { Volume2, Bell, Play, MessageCircle, RefreshCw, Smartphone, Loader2 } from "lucide-react";
import { Share, Plus } from "lucide-react";
import { NotificationTone, Platform } from "@/hooks/useNotificationSettings";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaTiktok } from "react-icons/fa";
import { useAutoRefreshSettings, intervalOptions, RefreshInterval } from "@/hooks/useAutoRefresh";
import { useWebPush } from "@/hooks/useWebPush";
import { toast } from "sonner";

interface PlatformTones {
  whatsapp: NotificationTone;
  messenger: NotificationTone;
  instagram: NotificationTone;
  tiktok: NotificationTone;
}

interface NotificationSettingsPanelProps {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  volume: number;
  tone: NotificationTone;
  platformTones: PlatformTones;
  desktopPermission: NotificationPermission | 'default';
  onToggleSound: () => void;
  onToggleDesktop: () => void;
  onVolumeChange: (volume: number) => void;
  onToneChange: (tone: NotificationTone) => void;
  onPlatformToneChange: (platform: Platform, tone: NotificationTone) => void;
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

const platformConfig: { platform: Platform; label: string; icon: React.ReactNode; color: string }[] = [
  { platform: 'whatsapp', label: 'WhatsApp', icon: <FaWhatsapp className="w-4 h-4" />, color: 'text-green-500' },
  { platform: 'messenger', label: 'Messenger', icon: <FaFacebookMessenger className="w-4 h-4" />, color: 'text-blue-500' },
  { platform: 'instagram', label: 'Instagram', icon: <FaInstagram className="w-4 h-4" />, color: 'text-pink-500' },
  { platform: 'tiktok', label: 'TikTok', icon: <FaTiktok className="w-4 h-4" />, color: 'text-foreground' },
];

export const NotificationSettingsPanel = ({
  soundEnabled,
  desktopEnabled,
  volume,
  tone,
  platformTones,
  desktopPermission,
  onToggleSound,
  onToggleDesktop,
  onVolumeChange,
  onToneChange,
  onPlatformToneChange,
  onRequestDesktopPermission,
}: NotificationSettingsPanelProps) => {
  const { playPreview } = useNotificationSound();
  const { status: pushStatus, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = useWebPush();
  const { 
    enabled: autoRefreshEnabled, 
    interval: autoRefreshInterval, 
    toggleEnabled: toggleAutoRefresh, 
    setInterval: setAutoRefreshInterval 
  } = useAutoRefreshSettings();

  const handlePreview = (selectedTone: NotificationTone) => {
    playPreview(volume, selectedTone);
  };

  const handleEnablePush = async () => {
    try {
      await pushSubscribe();
      toast.success("Notificaciones push activadas en este dispositivo");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo activar");
    }
  };

  // Detección iOS no instalado: en iPhone, Web Push solo funciona si la PWA
  // fue añadida a pantalla de inicio. Si no, mostramos instrucciones.
  const isIOS = typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !/CriOS|FxiOS/.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-ignore — iOS Safari
    (window.navigator as any).standalone === true
  );
  const iosNeedsInstall = isIOS && !isStandalone;

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

            {/* Platform-specific tones */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageCircle className="w-4 h-4" />
                Tonos por plataforma
              </div>
              
              {platformConfig.map(({ platform, label, icon, color }) => (
                <div key={platform} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 min-w-[100px] ${color}`}>
                    {icon}
                    <span className="text-sm">{label}</span>
                  </div>
                  <Select 
                    value={platformTones[platform]} 
                    onValueChange={(v) => onPlatformToneChange(platform, v as NotificationTone)}
                  >
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(toneLabels) as NotificationTone[]).map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {toneLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePreview(platformTones[platform])}
                    title="Escuchar tono"
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                </div>
              ))}
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

      {/* Auto-refresh Settings */}
      {/* Mobile Push Notifications (Web Push real con app cerrada) */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="w-4 h-4" />
          Notificaciones móviles (app cerrada)
        </div>
        <p className="text-xs text-muted-foreground">
          Recibe avisos en tu celular incluso con la app cerrada. En iPhone, instala primero la app a la pantalla de inicio.
        </p>
        {iosNeedsInstall && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <p className="text-xs font-medium">
              📱 En iPhone debes instalar la app primero
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
              <li className="flex items-center gap-1 flex-wrap">
                Toca <Share className="inline w-3 h-3" /> Compartir en Safari
              </li>
              <li className="flex items-center gap-1 flex-wrap">
                Elige <Plus className="inline w-3 h-3" /> "Añadir a pantalla de inicio"
              </li>
              <li>Abre Hey Hey desde el icono instalado y vuelve aquí</li>
            </ol>
          </div>
        )}
        {pushStatus === "unsupported" && (
          <p className="text-xs text-destructive">Tu navegador no soporta notificaciones push.</p>
        )}
        {pushStatus === "denied" && (
          <p className="text-xs text-destructive">
            Has bloqueado las notificaciones. Habilítalas en los ajustes del navegador y recarga.
          </p>
        )}
        {(pushStatus === "default" || pushStatus === "granted-no-sub") && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleEnablePush} disabled={pushLoading}>
            {pushLoading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
            Activar en este dispositivo
          </Button>
        )}
        {pushStatus === "subscribed" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-green-600 font-medium">✓ Activadas en este dispositivo</span>
            <Button variant="ghost" size="sm" onClick={() => pushUnsubscribe()} disabled={pushLoading}>
              Desactivar
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4" />
          Actualización automática
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="auto-refresh-toggle" className="text-sm text-muted-foreground">
            Actualización automática
          </Label>
          <Switch
            id="auto-refresh-toggle"
            checked={autoRefreshEnabled}
            onCheckedChange={toggleAutoRefresh}
          />
        </div>

        {autoRefreshEnabled && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Intervalo</Label>
            <Select
              value={String(autoRefreshInterval)}
              onValueChange={(value) => setAutoRefreshInterval(Number(value) as RefreshInterval)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar intervalo" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border z-50">
                {intervalOptions.filter(opt => opt.value !== 0).map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Las conversaciones y contactos se actualizarán automáticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
