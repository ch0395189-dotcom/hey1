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
  Globe, 
  Key, 
  Shield, 
  Bug,
  Copy,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DiagnosticItem {
  label: string;
  status: 'success' | 'error' | 'warning' | 'loading';
  value: string;
  details?: string;
}

interface FacebookDiagnosticsProps {
  onClose?: () => void;
}

export const FacebookDiagnostics = ({ onClose }: FacebookDiagnosticsProps) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [metaConfig, setMetaConfig] = useState<{ appId: string; configId?: string } | null>(null);
  const { toast } = useToast();

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

  const runDiagnostics = async () => {
    setIsRunning(true);
    setDiagnostics([]);
    setLastError(null);

    const results: DiagnosticItem[] = [];

    // 1. Check Meta Config from Edge Function
    try {
      const { data, error } = await supabase.functions.invoke('get-meta-config');
      if (error) throw error;
      
      setMetaConfig({ appId: data.appId || '', configId: data.configId || '' });
      
      results.push({
        label: 'Meta App ID',
        status: data.appId ? 'success' : 'error',
        value: data.appId ? `${data.appId.substring(0, 8)}...` : 'No configurado',
        details: data.appId ? 'App ID cargado correctamente desde el backend' : 'Falta META_APP_ID en los secrets'
      });
      
      results.push({
        label: 'Config ID (Embedded Signup)',
        status: data.configId ? 'success' : 'warning',
        value: data.configId ? `${data.configId.substring(0, 8)}...` : 'No configurado',
        details: data.configId ? 'Config ID disponible para Embedded Signup' : 'Opcional: solo necesario para WhatsApp Embedded Signup'
      });
    } catch (error: any) {
      results.push({
        label: 'Meta Config',
        status: 'error',
        value: 'Error al cargar',
        details: error.message || 'No se pudo conectar con get-meta-config'
      });
      setLastError(`Error cargando config: ${error.message}`);
    }

    // 2. Check current domain
    results.push({
      label: 'Dominio actual',
      status: 'success',
      value: currentDomain,
      details: 'Este dominio debe estar en App Domains de Meta'
    });

    results.push({
      label: 'Origen completo',
      status: 'success',
      value: currentOrigin,
      details: 'Añadir a Valid OAuth Redirect URIs y Allowed Domains for JS SDK'
    });

    results.push({
      label: 'Entorno',
      status: isEmbedded ? 'warning' : 'success',
      value: isEmbedded ? 'Dentro de iframe' : 'Ventana principal',
      details: isEmbedded 
        ? 'Los popups pueden ser bloqueados. Usa "Abrir en nueva pestaña"' 
        : 'Entorno ideal para login con Facebook'
    });

    // 3. Check Facebook SDK status
    const fbSdkLoaded = typeof window !== 'undefined' && window.FB && typeof window.FB.init === 'function';
    results.push({
      label: 'Facebook SDK',
      status: fbSdkLoaded ? 'success' : 'error',
      value: fbSdkLoaded ? 'Cargado' : 'No cargado',
      details: fbSdkLoaded 
        ? 'SDK listo para usar' 
        : 'El script de Facebook no se cargó. Verifica bloqueadores de anuncios o conexión'
    });

    // 4. Check FB.getLoginStatus if SDK is loaded
    if (fbSdkLoaded && typeof (window.FB as any).getLoginStatus === 'function') {
      try {
        await new Promise<void>((resolve) => {
          (window.FB as any).getLoginStatus((response: any) => {
            results.push({
              label: 'Estado de sesión FB',
              status: response.status === 'connected' ? 'success' : 'warning',
              value: response.status === 'connected' 
                ? 'Conectado' 
                : response.status === 'not_authorized' 
                  ? 'No autorizado' 
                  : 'Desconectado',
              details: response.status === 'connected'
                ? `Usuario ID: ${response.authResponse?.userID?.substring(0, 8)}...`
                : 'El usuario no ha autorizado la app o no está logueado en Facebook'
            });
            resolve();
          });
        });
      } catch (error) {
        results.push({
          label: 'Estado de sesión FB',
          status: 'error',
          value: 'Error al verificar',
          details: 'No se pudo obtener el estado de la sesión'
        });
      }
    }

    // 5. Permissions requested
    const messengerScopes = 'pages_messaging, pages_show_list, pages_read_engagement, pages_manage_metadata';
    const instagramScopes = 'instagram_basic, instagram_manage_messages, pages_show_list, pages_read_engagement';
    
    results.push({
      label: 'Permisos Messenger',
      status: 'success',
      value: 'Configurados',
      details: messengerScopes
    });

    results.push({
      label: 'Permisos Instagram',
      status: 'success',
      value: 'Configurados',
      details: instagramScopes
    });

    // 6. Meta configuration checklist
    results.push({
      label: 'Checklist Meta Dashboard',
      status: 'warning',
      value: 'Verificar manualmente',
      details: `1. App Domains: ${currentDomain}\n2. Valid OAuth Redirect: ${currentOrigin}/dashboard\n3. JS SDK Allowed Domains: ${currentDomain}`
    });

    setDiagnostics(results);
    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

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
            <Bug className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Diagnóstico de Facebook</CardTitle>
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
        <ScrollArea className="h-[300px] pr-4">
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
                {(item.label.includes('Dominio') || item.label.includes('Origen')) && (
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

        {lastError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              <span className="font-medium text-sm">Último error</span>
            </div>
            <p className="text-sm text-destructive/80 mt-1 font-mono break-all">
              {lastError}
            </p>
          </div>
        )}

        <div className="pt-2 border-t space-y-2">
          <p className="text-xs text-muted-foreground">
            Para configurar correctamente, ve a{' '}
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
              onClick={() => copyToClipboard(currentDomain)}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar dominio
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(`${currentOrigin}/dashboard`)}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar Redirect URI
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
