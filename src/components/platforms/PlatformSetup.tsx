import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  MessageCircle, 
  Instagram, 
  Video, 
  Plus, 
  CheckCircle2, 
  ExternalLink,
  Trash2,
  BadgeCheck
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PlatformAccount {
  id: string;
  platform: string;
  account_name: string | null;
  page_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface PlatformSetupProps {
  onAccountConnected?: () => void;
}

const platformConfig = {
  messenger: {
    name: "Messenger",
    icon: MessageCircle,
    color: "text-[#0084FF]",
    bgColor: "bg-[#0084FF]/10",
    description: "Conecta tu página de Facebook para recibir mensajes de Messenger",
    fields: [
      { key: "page_id", label: "Page ID", placeholder: "Ej: 123456789" },
      { key: "page_access_token", label: "Page Access Token", placeholder: "Token de acceso de la página", type: "password" }
    ]
  },
  instagram: {
    name: "Instagram",
    icon: Instagram,
    color: "text-[#E4405F]",
    bgColor: "bg-[#E4405F]/10",
    description: "Conecta tu cuenta de Instagram Business para mensajes directos",
    fields: [
      { key: "page_id", label: "Facebook Page ID", placeholder: "ID de la página de Facebook vinculada" },
      { key: "instagram_account_id", label: "Instagram Account ID", placeholder: "ID de la cuenta de Instagram" },
      { key: "page_access_token", label: "Page Access Token", placeholder: "Token de acceso", type: "password" }
    ]
  },
  tiktok: {
    name: "TikTok",
    icon: Video,
    color: "text-foreground",
    bgColor: "bg-foreground/10",
    description: "Conecta tu cuenta de TikTok Business para mensajes",
    fields: [
      { key: "tiktok_open_id", label: "TikTok Open ID", placeholder: "Open ID de TikTok" },
      { key: "tiktok_access_token", label: "Access Token", placeholder: "Token de acceso de TikTok", type: "password" }
    ]
  }
};

export const PlatformSetup = ({ onAccountConnected }: PlatformSetupProps) => {
  const [activeTab, setActiveTab] = useState<string>("messenger");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [accountName, setAccountName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['platform-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PlatformAccount[];
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from('platform_accounts')
        .delete()
        .eq('id', accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
      toast({
        title: "Cuenta eliminada",
        description: "La cuenta ha sido desconectada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo eliminar la cuenta.",
      });
    }
  });

  const handleConnect = async (platform: string) => {
    if (!accountName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingresa un nombre para la cuenta.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const verifyToken = crypto.randomUUID();

      const insertData: any = {
        user_id: user.id,
        platform,
        account_name: accountName.trim(),
        webhook_verify_token: verifyToken,
        ...formData
      };

      const { error } = await supabase
        .from('platform_accounts')
        .insert(insertData);

      if (error) throw error;

      toast({
        title: "¡Cuenta conectada!",
        description: `Tu cuenta de ${platformConfig[platform as keyof typeof platformConfig].name} ha sido vinculada.`,
      });

      setFormData({});
      setAccountName("");
      queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
      onAccountConnected?.();

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo conectar la cuenta.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAccountsByPlatform = (platform: string) => 
    accounts.filter(a => a.platform === platform);

  return (
    <div className="space-y-6">
      {/* Meta Partner Badge */}
      <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-[#0668E1]/10 border border-[#0668E1]/20">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#0668E1"/>
          <path d="M2 17L12 22L22 17" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-sm font-medium text-[#0668E1]">Meta Business Partner Verificado</span>
        <BadgeCheck className="w-4 h-4 text-[#0668E1]" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          {Object.entries(platformConfig).map(([key, config]) => {
            const Icon = config.icon;
            const count = getAccountsByPlatform(key).length;
            return (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <span>{config.name}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.entries(platformConfig).map(([platform, config]) => {
          const Icon = config.icon;
          const connectedAccounts = getAccountsByPlatform(platform);

          return (
            <TabsContent key={platform} value={platform} className="space-y-4 mt-4">
              {/* Connected Accounts */}
              {connectedAccounts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Cuentas conectadas</h4>
                  {connectedAccounts.map((account) => (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>
                        <div>
                          <p className="font-medium">{account.account_name || 'Sin nombre'}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="w-3 h-3 text-primary" />
                            Conectado
                          </div>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción eliminará la conexión con {account.account_name}. 
                              Las conversaciones existentes se mantendrán.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(account.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Add New Account */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plus className="w-5 h-5" />
                    Conectar nueva cuenta de {config.name}
                  </CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="account-name">Nombre de la cuenta</Label>
                    <Input
                      id="account-name"
                      placeholder="Ej: Mi tienda online"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                    />
                  </div>

                  {config.fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={field.key}>{field.label}</Label>
                      <Input
                        id={field.key}
                        type={field.type || "text"}
                        placeholder={field.placeholder}
                        value={formData[field.key] || ""}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          [field.key]: e.target.value
                        }))}
                      />
                    </div>
                  ))}

                  {platform !== 'tiktok' && (
                    <div className="p-3 rounded-lg bg-muted">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">¿Necesitas ayuda?</span> Puedes obtener estos datos desde el{" "}
                        <a 
                          href="https://developers.facebook.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Panel de Meta for Developers
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>
                  )}

                  {platform === 'tiktok' && (
                    <div className="p-3 rounded-lg bg-muted">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">¿Necesitas ayuda?</span> Puedes obtener estos datos desde el{" "}
                        <a 
                          href="https://developers.tiktok.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Portal de desarrolladores de TikTok
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>
                  )}

                  <Button 
                    onClick={() => handleConnect(platform)}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? "Conectando..." : `Conectar ${config.name}`}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};
