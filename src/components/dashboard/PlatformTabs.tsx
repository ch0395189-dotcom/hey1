import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Instagram, Video, Inbox } from "lucide-react";

// Custom Facebook Messenger icon
const MessengerIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.898 1.441 5.484 3.695 7.175V22l3.405-1.867c.91.252 1.878.389 2.9.389 5.523 0 10-4.145 10-9.243C22 6.145 17.523 2 12 2zm1.019 12.447l-2.548-2.714-4.972 2.714 5.466-5.8 2.614 2.714 4.906-2.714-5.466 5.8z"/>
  </svg>
);

export type Platform = 'whatsapp' | 'messenger' | 'instagram' | 'tiktok' | 'all';

interface PlatformTabsProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts?: {
    all: number;
    whatsapp: number;
    messenger: number;
    instagram: number;
    tiktok: number;
  };
}

const platforms = [
  { 
    id: 'all' as Platform, 
    name: 'Todos', 
    icon: Inbox, 
    color: 'text-primary',
    activeColor: 'data-[state=active]:text-primary'
  },
  { 
    id: 'whatsapp' as Platform, 
    name: 'WhatsApp', 
    icon: MessageCircle, 
    color: 'text-green-500',
    activeColor: 'data-[state=active]:text-green-500'
  },
  { 
    id: 'messenger' as Platform, 
    name: 'Messenger', 
    icon: MessengerIcon, 
    color: 'text-blue-500',
    activeColor: 'data-[state=active]:text-blue-500'
  },
  { 
    id: 'instagram' as Platform, 
    name: 'Instagram', 
    icon: Instagram, 
    color: 'text-pink-500',
    activeColor: 'data-[state=active]:text-pink-500'
  },
  { 
    id: 'tiktok' as Platform, 
    name: 'TikTok', 
    icon: Video, 
    color: 'text-foreground',
    activeColor: 'data-[state=active]:text-foreground'
  },
];

export const PlatformTabs = ({ 
  activePlatform, 
  onPlatformChange,
  counts = { all: 0, whatsapp: 0, messenger: 0, instagram: 0, tiktok: 0 }
}: PlatformTabsProps) => {
  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      <Tabs value={activePlatform} onValueChange={(v) => onPlatformChange(v as Platform)}>
        <TabsList className="w-full grid grid-cols-5 h-auto p-1">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const count = counts[platform.id];
            
            return (
              <TabsTrigger 
                key={platform.id} 
                value={platform.id}
                className={`flex flex-col items-center gap-1 py-2 px-1 ${platform.activeColor}`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${activePlatform === platform.id ? platform.color : 'text-muted-foreground'}`} />
                  {count > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-2 -right-2 h-4 min-w-[16px] px-1 text-[10px] font-bold"
                    >
                      {count > 99 ? '99+' : count}
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] font-medium truncate max-w-full">
                  {platform.name}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
};
