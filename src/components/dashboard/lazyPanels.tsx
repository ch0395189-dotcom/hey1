import { lazy, Suspense, ComponentType } from "react";
import { Loader2 } from "lucide-react";

/**
 * Paneles pesados del dashboard cargados bajo demanda.
 * Así el chunk inicial del dashboard sólo incluye la bandeja de entrada,
 * y los demás módulos (estadísticas, chatbot, equipo, etc.) se descargan
 * la primera vez que el usuario los abre.
 */
const PanelFallback = () => (
  <div className="flex items-center justify-center py-12 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" />
  </div>
);

function lazyPanel<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>
) {
  const Lazy = lazy(loader);
  return (props: P) => (
    <Suspense fallback={<PanelFallback />}>
      <Lazy {...props} />
    </Suspense>
  );
}

export const ChatbotConfig = lazyPanel<
  React.ComponentProps<typeof import("@/components/chatbot/ChatbotConfig")["ChatbotConfig"]>
>(() => import("@/components/chatbot/ChatbotConfig").then((m) => ({ default: m.ChatbotConfig })));

export const StatisticsPanel = lazyPanel<Record<string, never>>(() =>
  import("@/components/statistics/StatisticsPanel").then((m) => ({ default: m.StatisticsPanel }))
);

export const ContactsList = lazyPanel<Record<string, never>>(() =>
  import("@/components/contacts/ContactsList").then((m) => ({ default: m.ContactsList }))
);

export const TeamManagement = lazyPanel<Record<string, never>>(() =>
  import("@/components/team/TeamManagement").then((m) => ({ default: m.TeamManagement }))
);

export const ApiKeysSettings = lazyPanel<Record<string, never>>(() =>
  import("@/components/settings/ApiKeysSettings").then((m) => ({ default: m.ApiKeysSettings }))
);

export const PlatformSetup = lazyPanel<
  React.ComponentProps<typeof import("@/components/platforms/PlatformSetup")["PlatformSetup"]>
>(() => import("@/components/platforms/PlatformSetup").then((m) => ({ default: m.PlatformSetup })));

export const NotificationSettingsPanel = lazyPanel<
  React.ComponentProps<
    typeof import("@/components/notifications/NotificationSettingsPanel")["NotificationSettingsPanel"]
  >
>(() =>
  import("@/components/notifications/NotificationSettingsPanel").then((m) => ({
    default: m.NotificationSettingsPanel,
  }))
);

export const WhatsAppSetup = lazyPanel<
  React.ComponentProps<typeof import("@/components/whatsapp/WhatsAppSetup")["WhatsAppSetup"]>
>(() => import("@/components/whatsapp/WhatsAppSetup").then((m) => ({ default: m.WhatsAppSetup })));
