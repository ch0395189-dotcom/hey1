import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, X, Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ButtonOption {
  id: string;
  title: string;
}

interface ListOption {
  id: string;
  title: string;
  description?: string;
}

interface InteractiveMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (data: InteractiveMessageData) => Promise<void>;
}

export interface InteractiveMessageData {
  type: 'buttons' | 'list';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: ButtonOption[];
  listTitle?: string;
  listOptions?: ListOption[];
}

export function InteractiveMessageDialog({
  open,
  onOpenChange,
  onSend,
}: InteractiveMessageDialogProps) {
  const [type, setType] = useState<'buttons' | 'list'>('buttons');
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<ButtonOption[]>([
    { id: "btn_1", title: "" },
  ]);
  const [listTitle, setListTitle] = useState("Opciones");
  const [listOptions, setListOptions] = useState<ListOption[]>([
    { id: "opt_1", title: "", description: "" },
  ]);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const addButton = () => {
    if (buttons.length >= 3) {
      toast({
        title: "Límite alcanzado",
        description: "Máximo 3 botones permitidos por WhatsApp.",
        variant: "destructive",
      });
      return;
    }
    setButtons([...buttons, { id: `btn_${Date.now()}`, title: "" }]);
  };

  const removeButton = (index: number) => {
    if (buttons.length <= 1) return;
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, title: string) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], title: title.slice(0, 20) };
    setButtons(newButtons);
  };

  const addListOption = () => {
    if (listOptions.length >= 10) {
      toast({
        title: "Límite alcanzado",
        description: "Máximo 10 opciones permitidas por WhatsApp.",
        variant: "destructive",
      });
      return;
    }
    setListOptions([...listOptions, { id: `opt_${Date.now()}`, title: "", description: "" }]);
  };

  const removeListOption = (index: number) => {
    if (listOptions.length <= 1) return;
    setListOptions(listOptions.filter((_, i) => i !== index));
  };

  const updateListOption = (index: number, field: 'title' | 'description', value: string) => {
    const newOptions = [...listOptions];
    if (field === 'title') {
      newOptions[index] = { ...newOptions[index], title: value.slice(0, 24) };
    } else {
      newOptions[index] = { ...newOptions[index], description: value.slice(0, 72) };
    }
    setListOptions(newOptions);
  };

  const handleSend = async () => {
    if (!bodyText.trim()) {
      toast({
        title: "Mensaje requerido",
        description: "Debes escribir un mensaje para enviar.",
        variant: "destructive",
      });
      return;
    }

    if (type === 'buttons') {
      const validButtons = buttons.filter(b => b.title.trim());
      if (validButtons.length === 0) {
        toast({
          title: "Botones requeridos",
          description: "Debes agregar al menos un botón con texto.",
          variant: "destructive",
        });
        return;
      }
    }

    if (type === 'list') {
      const validOptions = listOptions.filter(o => o.title.trim());
      if (validOptions.length === 0) {
        toast({
          title: "Opciones requeridas",
          description: "Debes agregar al menos una opción con título.",
          variant: "destructive",
        });
        return;
      }
    }

    setSending(true);
    try {
      await onSend({
        type,
        headerText: headerText.trim() || undefined,
        bodyText: bodyText.trim(),
        footerText: footerText.trim() || undefined,
        buttons: type === 'buttons' ? buttons.filter(b => b.title.trim()) : undefined,
        listTitle: type === 'list' ? listTitle : undefined,
        listOptions: type === 'list' ? listOptions.filter(o => o.title.trim()) : undefined,
      });
      
      // Reset form
      setHeaderText("");
      setBodyText("");
      setFooterText("");
      setButtons([{ id: "btn_1", title: "" }]);
      setListOptions([{ id: "opt_1", title: "", description: "" }]);
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending interactive message:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mensaje Interactivo</DialogTitle>
          <DialogDescription>
            Envía un mensaje con botones o lista de opciones
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message Type */}
          <div className="space-y-2">
            <Label>Tipo de mensaje</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as 'buttons' | 'list')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="buttons" id="buttons" />
                <Label htmlFor="buttons" className="cursor-pointer">Botones (máx. 3)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="list" id="list" />
                <Label htmlFor="list" className="cursor-pointer">Lista (máx. 10)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Header (optional) */}
          <div className="space-y-2">
            <Label htmlFor="header">Encabezado (opcional)</Label>
            <Input
              id="header"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value.slice(0, 60))}
              placeholder="Título del mensaje"
              maxLength={60}
            />
            <span className="text-xs text-muted-foreground">{headerText.length}/60</span>
          </div>

          {/* Body (required) */}
          <div className="space-y-2">
            <Label htmlFor="body">Mensaje *</Label>
            <Textarea
              id="body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value.slice(0, 1024))}
              placeholder="Escribe tu mensaje aquí..."
              rows={3}
              maxLength={1024}
            />
            <span className="text-xs text-muted-foreground">{bodyText.length}/1024</span>
          </div>

          {/* Footer (optional) */}
          <div className="space-y-2">
            <Label htmlFor="footer">Pie de página (opcional)</Label>
            <Input
              id="footer"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value.slice(0, 60))}
              placeholder="Texto adicional"
              maxLength={60}
            />
            <span className="text-xs text-muted-foreground">{footerText.length}/60</span>
          </div>

          {/* Buttons */}
          {type === 'buttons' && (
            <div className="space-y-3">
              <Label>Botones de respuesta rápida</Label>
              {buttons.map((button, index) => (
                <div key={button.id} className="flex items-center gap-2">
                  <Input
                    value={button.title}
                    onChange={(e) => updateButton(index, e.target.value)}
                    placeholder={`Botón ${index + 1}`}
                    maxLength={20}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-10">{button.title.length}/20</span>
                  {buttons.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeButton(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {buttons.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addButton}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar botón
                </Button>
              )}
            </div>
          )}

          {/* List Options */}
          {type === 'list' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="listTitle">Título del botón de lista</Label>
                <Input
                  id="listTitle"
                  value={listTitle}
                  onChange={(e) => setListTitle(e.target.value.slice(0, 20))}
                  placeholder="Ver opciones"
                  maxLength={20}
                />
              </div>
              
              <Label>Opciones de la lista</Label>
              {listOptions.map((option, index) => (
                <div key={option.id} className="space-y-2 p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Input
                      value={option.title}
                      onChange={(e) => updateListOption(index, 'title', e.target.value)}
                      placeholder={`Opción ${index + 1}`}
                      maxLength={24}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-10">{option.title.length}/24</span>
                    {listOptions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeListOption(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={option.description || ""}
                    onChange={(e) => updateListOption(index, 'description', e.target.value)}
                    placeholder="Descripción (opcional)"
                    maxLength={72}
                    className="text-sm"
                  />
                </div>
              ))}
              {listOptions.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addListOption}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar opción
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="bg-gradient-hero hover:opacity-90"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
