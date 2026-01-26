import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Copy,
  ExternalLink,
  MessageCircle,
  Webhook,
  Key,
  Database
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DiagnosticItem {
  label: string;
  status: 'success' | 'error' | 'warning' | 'loading';
  value: string;
  details?: string;
  copyable?: boolean;
}

interface WhatsAppDiagnosticsProps {
  accountId?: string;
  onClose?: () => void;
}

export const WhatsAppDiagnostics = ({ accountId, onClose }: WhatsAppDiagnosticsProps) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook-v2`;

  const runDiagnostics = async () => {
    setIsRunning(true);
    setDiagnostics([]);

    const results: DiagnosticItem[] = [];

    // 1. Check Supabase URL
    results.push({
      label: 'URL de Supabase',
      status: supabaseUrl ? 'success' : 'error',
      value: supabaseUrl ? 'Configurado' : 'No configurado',
      details: supabaseUrl || 'Falta VITE_SUPABASE_URL en variables de entorno'
    });

    // 2. Webhook URL
    results.push({
      label: 'URL del Webhook',
      status: 'success',
      value: webhookUrl,
      details: 'Esta URL debe configurarse en Meta for Developers → Webhooks',
      copyable: true
    });

    // 3. Check if user has WhatsApp accounts
    try {
      const { data: accounts, error } = await supabase
        .from('whatsapp_accounts')
        .select('id, display_name, phone_number_id, webhook_verify_token, is_active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (accounts && accounts.length > 0) {
        results.push({
          label: 'Cuentas de WhatsApp',
          status: 'success',
          value: `${accounts.length} cuenta(s) registrada(s)`,
          details: accounts.map(a => `• ${a.display_name || a.phone_number_id} ${a.is_active ? '(activa)' : '(inactiva)'}`).join('\n')
        });

        // Check each account's verify token
        const activeAccount = accountId 
          ? accounts.find(a => a.id === accountId) 
          : accounts.find(a => a.is_active) || accounts[0];

        if (activeAccount) {
          results.push({
            label: 'Token de verificación',
            status: activeAccount.webhook_verify_token ? 'success' : 'warning',
            value: activeAccount.webhook_verify_token || 'No configurado',
            details: activeAccount.webhook_verify_token 
              ? 'Usa este token al configurar el webhook en Meta'
              : 'Configura un token de verificación para validar el webhook',
            copyable: !!activeAccount.webhook_verify_token
          });

          results.push({
            label: 'Phone Number ID',
            status: activeAccount.phone_number_id ? 'success' : 'error',
            value: activeAccount.phone_number_id || 'No configurado',
            details: 'ID del número de teléfono en WhatsApp Business API',
            copyable: !!activeAccount.phone_number_id
          });
        }
      } else {
        results.push({
          label: 'Cuentas de WhatsApp',
          status: 'warning',
          value: 'Sin cuentas',
          details: 'No hay cuentas de WhatsApp configuradas. Agrega una cuenta para empezar.'
        });
      }
    } catch (error: any) {
      results.push({
        label: 'Cuentas de WhatsApp',
        status: 'error',
        value: 'Error al verificar',
        details: error.message || 'No se pudo consultar la base de datos'
      });
    }

    // 4. Test webhook endpoint availability
    try {
      const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=heyhey_webhook_2024`;
      const response = await fetch(testUrl, { method: 'GET' });
      
      if (response.ok) {
        const text = await response.text();
        results.push({
          label: 'Endpoint del Webhook',
          status: text === 'test123' ? 'success' : 'warning',
          value: text === 'test123' ? 'Responde correctamente' : 'Respuesta inesperada',
          details: text === 'test123' 
            ? 'El endpoint responde correctamente a las verificaciones de Meta'
            : `Respuesta: ${text.substring(0, 100)}`
        });
      } else {
        results.push({
          label: 'Endpoint del Webhook',
          status: 'error',
          value: `Error HTTP ${response.status}`,
          details: 'El endpoint no responde correctamente. Verifica que la Edge Function esté desplegada.'
        });
      }
    } catch (error: any) {
      results.push({
        label: 'Endpoint del Webhook',
        status: 'error',
        value: 'No accesible',
        details: error.message || 'No se pudo conectar con el endpoint del webhook'
      });
    }

    // 5. Meta configuration checklist
    results.push({
      label: 'Configuración en Meta',
      status: 'warning',
      value: 'Verificar manualmente',
      details: `1. Ir a Meta for Developers\n2. Seleccionar tu App\n3. WhatsApp → Configuración\n4. Configurar Webhook con la URL y token\n5. Suscribirse a: messages, message_deliveries`
    });

    // 6. Required webhook fields
    results.push({
      label: 'Campos de Webhook requeridos',
      status: 'success',
      value: 'messages, message_deliveries',
      details: 'Estos campos deben estar suscritos en la configuración del webhook de Meta'
    });

    setDiagnostics(results);
    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, [accountId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: "Texto copiado al portapapeles"
    });
  };

  const getStatusIcon = (status: DiagnosticItem['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'loading':
        return <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: DiagnosticItem['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">OK</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Advertencia</Badge>;
      case 'loading':
        return <Badge variant="secondary">Cargando...</Badge>;
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-500" />
            <CardTitle className="text-base">Diagnóstico de WhatsApp</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={runDiagnostics}
            disabled={isRunning}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRunning ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-3">
            {diagnostics.map((item, index) => (
              <div 
                key={index} 
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
              >
                <div className="mt-0.5">{getStatusIcon(item.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.label}</span>
                    {getStatusBadge(item.status)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                    {item.value}
                  </p>
                  {item.details && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {item.details}
                    </p>
                  )}
                </div>
                {item.copyable && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 shrink-0"
                    onClick={() => copyToClipboard(item.value)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="pt-2 border-t space-y-2">
          <p className="text-xs text-muted-foreground">
            Para configurar el webhook, ve a{' '}
            <a 
              href="https://developers.facebook.com/apps" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Meta for Developers <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(webhookUrl)}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar URL Webhook
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
