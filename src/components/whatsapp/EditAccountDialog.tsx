import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface WhatsAppAccount {
  id: string;
  phone_number: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  display_name: string | null;
  is_active: boolean;
  webhook_verify_token: string | null;
}

interface EditAccountDialogProps {
  account: WhatsAppAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountUpdated: () => void;
}

export const EditAccountDialog = ({
  account,
  open,
  onOpenChange,
  onAccountUpdated,
}: EditAccountDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    phoneNumberId: "",
    businessAccountId: "",
    accessToken: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (account) {
      setFormData({
        displayName: account.display_name || account.phone_number,
        phoneNumberId: account.phone_number_id || "",
        businessAccountId: account.business_account_id || "",
        accessToken: "", // Don't show current token for security
      });
    }
  }, [account]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!account) return;

    if (!formData.displayName || !formData.phoneNumberId || !formData.businessAccountId) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos obligatorios.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const updateData: Record<string, string> = {
        display_name: formData.displayName,
        phone_number: formData.displayName,
        phone_number_id: formData.phoneNumberId,
        business_account_id: formData.businessAccountId,
      };

      // Only update token if a new one was provided
      if (formData.accessToken.trim()) {
        updateData.access_token = formData.accessToken;
      }

      const { error } = await supabase
        .from("whatsapp_accounts")
        .update(updateData)
        .eq("id", account.id);

      if (error) throw error;

      toast({
        title: "¡Cuenta actualizada!",
        description: "Los datos de la cuenta se han actualizado correctamente.",
      });

      onOpenChange(false);
      onAccountUpdated();
    } catch (error: any) {
      console.error("Error updating WhatsApp account:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la cuenta.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cuenta de WhatsApp</DialogTitle>
          <DialogDescription>
            Actualiza los datos de conexión de tu cuenta de WhatsApp Business
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-displayName">Nombre *</Label>
            <Input
              id="edit-displayName"
              placeholder="Nombre de la cuenta"
              value={formData.displayName}
              onChange={(e) => handleInputChange("displayName", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phoneNumberId">ID del número de teléfono *</Label>
            <Input
              id="edit-phoneNumberId"
              placeholder="Ej: 123456789012345"
              value={formData.phoneNumberId}
              onChange={(e) => handleInputChange("phoneNumberId", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-businessAccountId">ID de la cuenta de WhatsApp Business *</Label>
            <Input
              id="edit-businessAccountId"
              placeholder="Ej: 123456789012345"
              value={formData.businessAccountId}
              onChange={(e) => handleInputChange("businessAccountId", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-accessToken">
              Token de acceso{" "}
              <span className="text-muted-foreground text-xs">(dejar vacío para mantener el actual)</span>
            </Label>
            <Input
              id="edit-accessToken"
              type="password"
              placeholder="Nuevo token de acceso"
              value={formData.accessToken}
              onChange={(e) => handleInputChange("accessToken", e.target.value)}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-hero hover:opacity-90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
