import { useNavigate } from "react-router-dom";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useImpersonation, clearImpersonation } from "@/lib/effectiveAuth";

export const ImpersonationBanner = () => {
  const { isImpersonating, meta } = useImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating) return null;

  const stop = async () => {
    await clearImpersonation();
    navigate("/admin");
  };

  return (
    <div className="sticky top-0 z-[100] w-full bg-destructive text-destructive-foreground px-3 py-2 flex items-center gap-2 flex-wrap shadow-md">
      <ShieldAlert className="h-4 w-4 flex-shrink-0" />
      <Badge variant="secondary" className="flex-shrink-0 text-destructive">MODO ADMIN</Badge>
      <span className="text-sm truncate">
        Actuando como <strong>{meta.name || meta.email || "usuario"}</strong>
        {meta.email && meta.name && <span className="opacity-80"> · {meta.email}</span>}
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="ml-auto h-7 text-destructive"
        onClick={stop}
      >
        <X className="h-3 w-3 mr-1" /> Salir del modo admin
      </Button>
    </div>
  );
};