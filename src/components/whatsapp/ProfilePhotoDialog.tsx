import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ImagePlus, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProfilePhotoDialogProps {
  accountId: string | null;
  accountLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Reescala la imagen a 640x640 (recorte centrado) y la devuelve como JPEG base64. */
async function toSquareJpegBase64(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagen inválida"));
    el.src = dataUrl;
  });

  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.9);
}

export const ProfilePhotoDialog = ({
  accountId,
  accountLabel,
  open,
  onOpenChange,
}: ProfilePhotoDialogProps) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accountId) return;
    setPreview(null);
    setNotice(null);
    setCurrentUrl(null);
    setLoading(true);
    supabase.functions
      .invoke("whatsapp-profile-photo", { body: { action: "get", account_id: accountId } })
      .then(({ data, error }) => {
        if (error) throw error;
        if (data?.error) setNotice(data.error);
        else setCurrentUrl(data?.profile_picture_url || null);
      })
      .catch(() => setNotice("No se pudo cargar la foto actual."))
      .finally(() => setLoading(false));
  }, [open, accountId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png)$/.test(file.type)) {
      toast({ title: "Formato no válido", description: "Usa una imagen JPG o PNG.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES * 4) {
      toast({ title: "Imagen muy grande", description: "Elige una imagen más liviana.", variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await toSquareJpegBase64(file);
      setPreview(dataUrl);
      setNotice(null);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo procesar la imagen",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!accountId || !preview) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-profile-photo", {
        body: {
          action: "update",
          account_id: accountId,
          image_base64: preview,
          mime_type: "image/jpeg",
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "No se pudo actualizar", description: data.error, variant: "destructive" });
        return;
      }
      setCurrentUrl(data?.profile_picture_url || preview);
      setPreview(null);
      toast({
        title: "¡Foto actualizada!",
        description: "La nueva foto de perfil ya aparece en tu WhatsApp Business.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo actualizar la foto",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const shown = preview || currentUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Foto de perfil de WhatsApp</DialogTitle>
          <DialogDescription>
            Cambia la imagen que ven tus clientes{accountLabel ? ` en ${accountLabel}` : ""}. El nombre no se modifica.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-32 h-32 rounded-full overflow-hidden border bg-muted flex items-center justify-center">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : shown ? (
              <img src={shown} alt="Foto de perfil de WhatsApp" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-muted-foreground" />
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={handleFile}
          />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={saving}>
            <ImagePlus className="w-4 h-4 mr-2" />
            Elegir imagen
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            JPG o PNG. Se recorta automáticamente a un cuadrado de 640×640 px.
          </p>

          {notice && <p className="text-xs text-destructive text-center">{notice}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!preview || saving} className="bg-gradient-hero hover:opacity-90">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar foto"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
