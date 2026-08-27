import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Star, Trash2, Bookmark } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export interface WhatsAppButtonData {
  bodyText: string;
  footerText?: string;
  ctaText: string;
  ctaUrl: string;
  phone: string;
  prefilledMessage?: string;
}

interface WhatsAppButtonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (data: WhatsAppButtonData) => Promise<void>;
}

interface SavedButton {
  id: string;
  label: string;
  phone: string;
  prefilled: string;
  bodyText: string;
  footerText: string;
  ctaText: string;
}

const STORAGE_KEY = "heyhey_saved_wa_buttons";

const loadSaved = (): SavedButton[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function WhatsAppButtonDialog({ open, onOpenChange, onSend }: WhatsAppButtonDialogProps) {
  const [phone, setPhone] = useState("");
  const [prefilled, setPrefilled] = useState("Hola, vengo del chat y quiero más información.");
  const [bodyText, setBodyText] = useState("Toca el botón para hablar directamente con un asesor.");
  const [footerText, setFooterText] = useState("");
  const [ctaText, setCtaText] = useState("Abrir WhatsApp");
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<SavedButton[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setSaved(loadSaved());
  }, [open]);

  const persist = (list: SavedButton[]) => {
    setSaved(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* almacenamiento no disponible */ }
  };

  const applySaved = (b: SavedButton) => {
    setPhone(b.phone);
    setPrefilled(b.prefilled);
    setBodyText(b.bodyText);
    setFooterText(b.footerText);
    setCtaText(b.ctaText);
  };

  const saveCurrent = () => {
    const d = phone.replace(/\D/g, "");
    if (d.length < 10 || !bodyText.trim() || !ctaText.trim()) {
      toast({
        title: "Faltan datos",
        description: "Completa número, mensaje y texto del botón antes de guardar.",
        variant: "destructive",
      });
      return;
    }
    const entry: SavedButton = {
      id: crypto.randomUUID(),
      label: `${ctaText.trim()} · +${d}`,
      phone: d,
      prefilled,
      bodyText,
      footerText,
      ctaText,
    };
    const next = [entry, ...saved.filter((s) => !(s.phone === d && s.ctaText === ctaText))].slice(0, 10);
    persist(next);
    toast({ title: "Botón guardado", description: "Podrás reutilizarlo con un solo toque." });
  };

  const removeSaved = (id: string) => persist(saved.filter((s) => s.id !== id));


  const digits = phone.replace(/\D/g, "");
  const waUrl = digits
    ? `https://wa.me/${digits}${prefilled.trim() ? `?text=${encodeURIComponent(prefilled.trim())}` : ""}`
    : "";

  const handleSend = async () => {
    if (digits.length < 10) {
      toast({
        title: "Número inválido",
        description: "Escribe el número con código de país (ej: 573001234567).",
        variant: "destructive",
      });
      return;
    }
    if (!bodyText.trim()) {
      toast({ title: "Mensaje requerido", description: "Escribe el texto del mensaje.", variant: "destructive" });
      return;
    }
    if (!ctaText.trim()) {
      toast({ title: "Texto del botón requerido", description: "Escribe el texto del botón.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      await onSend({
        bodyText: bodyText.trim(),
        footerText: footerText.trim() || undefined,
        ctaText: ctaText.trim().slice(0, 20),
        ctaUrl: waUrl,
        phone: digits,
        prefilledMessage: prefilled.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      // el error ya se muestra en el chat
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FaWhatsapp className="w-5 h-5 text-green-500" />
            Enviar botón de WhatsApp
          </DialogTitle>
          <DialogDescription>
            El cliente recibe un botón que abre otro chat de WhatsApp (por ejemplo, el de un asesor).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="wa-btn-phone">Número destino</Label>
            <Input
              id="wa-btn-phone"
              inputMode="tel"
              placeholder="573001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Incluye el código de país (57 para Colombia).</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-btn-prefilled">Mensaje precargado (opcional)</Label>
            <Input
              id="wa-btn-prefilled"
              placeholder="Hola, quiero más información"
              value={prefilled}
              onChange={(e) => setPrefilled(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-btn-body">Mensaje</Label>
            <Textarea
              id="wa-btn-body"
              rows={3}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value.slice(0, 1024))}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wa-btn-cta">Texto del botón</Label>
              <Input
                id="wa-btn-cta"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value.slice(0, 20))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-btn-footer">Pie (opcional)</Label>
              <Input
                id="wa-btn-footer"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value.slice(0, 60))}
              />
            </div>
          </div>

          {waUrl && (
            <p className="text-xs text-muted-foreground break-all">
              Enlace: {waUrl}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Enviar botón
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}