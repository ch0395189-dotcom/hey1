import { Badge } from "@/components/ui/badge";
import { MessageCircle, Instagram, Video, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaTiktok } from "react-icons/fa";

export type Platform = 'whatsapp' | 'messenger' | 'instagram' | 'tiktok' | 'all';

interface WhatsAppAccountItem {
  id: string;
  display_name?: string | null;
  phone_number: string;
}

interface PlatformSidebarProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts?: {
    all: number;
    whatsapp: number;
    messenger: number;
    instagram: number;
    tiktok: number;
  };
  whatsappAccounts?: WhatsAppAccountItem[];
  selectedAccountId?: string | null;
  onSelectAccount?: (accountId: string) => void;
}

const platforms = [
  { 
    id: 'all' as Platform, 
    name: 'Todos', 
    icon: Inbox, 
    bgColor: 'bg-primary',
    activeBg: 'bg-primary/20',
    textColor: 'text-primary',
  },
  { 
    id: 'whatsapp' as Platform, 
    name: 'WhatsApp', 
    icon: FaWhatsapp, 
    bgColor: 'bg-green-500',
    activeBg: 'bg-green-500/20',
    textColor: 'text-green-500',
  },
  { 
    id: 'messenger' as Platform, 
    name: 'Messenger', 
    icon: FaFacebookMessenger, 
    bgColor: 'bg-blue-500',
    activeBg: 'bg-blue-500/20',
    textColor: 'text-blue-500',
  },
  { 
    id: 'instagram' as Platform, 
    name: 'Instagram', 
    icon: FaInstagram, 
    bgColor: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
    activeBg: 'bg-pink-500/20',
    textColor: 'text-pink-500',
  },
  { 
    id: 'tiktok' as Platform, 
    name: 'TikTok', 
    icon: FaTiktok, 
    bgColor: 'bg-foreground',
    activeBg: 'bg-foreground/20',
    textColor: 'text-foreground',
  },
];

export const PlatformSidebar = ({ 
  activePlatform, 
  onPlatformChange,
  counts = { all: 0, whatsapp: 0, messenger: 0, instagram: 0, tiktok: 0 },
  whatsappAccounts = [],
  selectedAccountId = null,
  onSelectAccount,
}: PlatformSidebarProps) => {
  return (
    <div className="hidden md:flex w-16 bg-card border-r border-border flex-col items-center py-4 gap-2 overflow-y-auto">
      {platforms.map((platform) => {
        const Icon = platform.icon;
        const count = counts[platform.id];
        const isActive = activePlatform === platform.id;
        
        return (
          <button 
            key={platform.id}
            onClick={() => onPlatformChange(platform.id)}
            className={cn(
              "relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
              isActive 
                ? `${platform.activeBg} ring-2 ring-offset-2 ring-offset-card ${platform.textColor} ring-current` 
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
            title={platform.name}
          >
            <Icon className={cn(
              "w-5 h-5",
              isActive && platform.textColor
            )} />
            {count > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] font-bold"
              >
                {count > 99 ? '99+' : count}
              </Badge>
            )}
          </button>
        );
      })}

      {/* Una bandeja por número de WhatsApp conectado */}
      {whatsappAccounts.length > 0 && (
        <>
          <div className="w-8 h-px bg-border my-2" />
          {whatsappAccounts.map((acc, idx) => {
            const isActive = activePlatform === 'whatsapp' && selectedAccountId === acc.id;
            const label = acc.display_name?.trim() || `WhatsApp ${idx + 1}`;
            return (
              <button
                key={acc.id}
                onClick={() => {
                  onSelectAccount?.(acc.id);
                  onPlatformChange('whatsapp');
                }}
                className={cn(
                  "relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                  isActive
                    ? "bg-green-500/20 ring-2 ring-offset-2 ring-offset-card text-green-500 ring-current"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
                title={`${label} · ${acc.phone_number}`}
              >
                <FaWhatsapp className={cn("w-5 h-5", isActive && "text-green-500")} />
                <span
                  className={cn(
                    "absolute -bottom-1 -right-1 h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                    isActive ? "bg-green-500 text-white" : "bg-muted text-foreground border border-border",
                  )}
                >
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </>
      )}

      <div className="mt-auto text-[10px] text-muted-foreground text-center px-2 pt-2">
        Bandejas
      </div>
    </div>
  );
};
