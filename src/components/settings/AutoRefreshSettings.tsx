import { RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutoRefreshSettings, intervalOptions, RefreshInterval } from "@/hooks/useAutoRefresh";

export const AutoRefreshSettings = () => {
  const { enabled, interval, toggleEnabled, setInterval } = useAutoRefreshSettings();

  return (
    <div className="space-y-4 p-4 border border-border rounded-lg bg-card">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-5 h-5 text-primary" />
        <h3 className="font-medium">Auto-refresh</h3>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="auto-refresh-toggle" className="text-sm">
          Actualización automática
        </Label>
        <Switch
          id="auto-refresh-toggle"
          checked={enabled}
          onCheckedChange={toggleEnabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="refresh-interval" className="text-sm text-muted-foreground">
          Intervalo de actualización
        </Label>
        <Select
          value={String(interval)}
          onValueChange={(value) => setInterval(Number(value) as RefreshInterval)}
          disabled={!enabled}
        >
          <SelectTrigger id="refresh-interval" className="w-full">
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
      </div>

      {enabled && (
        <p className="text-xs text-muted-foreground">
          Las conversaciones y contactos se actualizarán cada {intervalOptions.find(o => o.value === interval)?.label.toLowerCase()}.
        </p>
      )}
    </div>
  );
};
