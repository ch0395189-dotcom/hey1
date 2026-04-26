import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Check, Loader2, Pencil } from "lucide-react";
import { Tag as TagIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTeam } from "@/hooks/useTeam";
import { useIsMobile } from "@/hooks/use-mobile";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ConversationTag {
  tag_id: string;
  contact_tags: Tag;
}

interface TagManagerProps {
  conversationId: string;
  onTagsChange?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const TAG_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export const TagManager = ({ conversationId, onTagsChange, open: controlledOpen, onOpenChange, hideTrigger }: TagManagerProps) => {
  const { isAgent, ownerId, myPermissions } = useTeam();
  const isMobile = useIsMobile();
  const canManageTags = !isAgent || myPermissions.create_tags;
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    if (controlledOpen === undefined) setInternalOpen(v);
  };
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(TAG_COLORS[0]);
  const [togglingTagIds, setTogglingTagIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTags();
    }
  }, [open, conversationId]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      // Fetch all user's tags
      const { data: tags, error: tagsError } = await supabase
        .from('contact_tags')
        .select('*')
        .order('name');

      if (tagsError) throw tagsError;
      setAvailableTags(tags || []);

      // Fetch tags assigned to this conversation
      const { data: conversationTags, error: convTagsError } = await supabase
        .from('conversation_tags')
        .select('tag_id')
        .eq('conversation_id', conversationId);

      if (convTagsError) throw convTagsError;
      setAssignedTagIds(new Set(conversationTags?.map(ct => ct.tag_id) || []));
    } catch (error) {
      console.error('Error fetching tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      // Tags belong to the owner so the whole team shares them
      const tagOwner = ownerId ?? user.id;

      const { data, error } = await supabase
        .from('contact_tags')
        .insert({
          user_id: tagOwner,
          name: newTagName.trim(),
          color: newTagColor,
        })
        .select()
        .single();

      if (error) throw error;

      setAvailableTags(prev => [...prev, data]);
      setNewTagName("");
      toast({
        title: "Etiqueta creada",
        description: `La etiqueta "${data.name}" ha sido creada.`,
      });
    } catch (error: any) {
      console.error('Error creating tag:', error);
      toast({
        title: "Error",
        description: error.message?.includes('duplicate') 
          ? "Ya existe una etiqueta con ese nombre." 
          : "No se pudo crear la etiqueta.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = async (tagId: string) => {
    const isAssigned = assignedTagIds.has(tagId);
    const tag = availableTags.find(t => t.id === tagId);

    // Optimistic update: cambiamos el estado YA, antes de esperar a la red.
    // Si falla, revertimos.
    setAssignedTagIds(prev => {
      const next = new Set(prev);
      if (isAssigned) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
    // Marcamos esta etiqueta como "guardando" para mostrar el spinner.
    setTogglingTagIds(prev => new Set(prev).add(tagId));

    try {
      if (isAssigned) {
        const { error } = await supabase
          .from('conversation_tags')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('tag_id', tagId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('conversation_tags')
          .insert({
            conversation_id: conversationId,
            tag_id: tagId,
          });

        if (error) throw error;
      }
      onTagsChange?.();
      toast({
        title: isAssigned ? "Etiqueta quitada" : "Etiqueta asignada",
        description: tag ? `"${tag.name}"` : undefined,
      });
    } catch (error) {
      console.error('Error toggling tag:', error);
      // Revertir el cambio optimista
      setAssignedTagIds(prev => {
        const next = new Set(prev);
        if (isAssigned) next.add(tagId);
        else next.delete(tagId);
        return next;
      });
      toast({
        title: "Error",
        description: "No se pudo actualizar la etiqueta.",
        variant: "destructive",
      });
    } finally {
      setTogglingTagIds(prev => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    }
  };

  const deleteTag = async (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      setAvailableTags(prev => prev.filter(t => t.id !== tagId));
      setAssignedTagIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(tagId);
        return newSet;
      });
      onTagsChange?.();
      
      toast({
        title: "Etiqueta eliminada",
        description: "La etiqueta ha sido eliminada.",
      });
    } catch (error) {
      console.error('Error deleting tag:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la etiqueta.",
        variant: "destructive",
      });
    }
  };

  const startEditTag = (tag: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTagId(null);
    setEditName("");
  };

  const saveEditTag = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!editingTagId || !editName.trim()) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('contact_tags')
        .update({ name: editName.trim(), color: editColor })
        .eq('id', editingTagId)
        .select()
        .single();

      if (error) throw error;

      setAvailableTags(prev =>
        prev.map(t => (t.id === editingTagId ? data : t)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingTagId(null);
      onTagsChange?.();
      toast({
        title: "Etiqueta actualizada",
        description: `La etiqueta "${data.name}" ha sido actualizada.`,
      });
    } catch (error: any) {
      console.error('Error updating tag:', error);
      toast({
        title: "Error",
        description: error.message?.includes('duplicate')
          ? "Ya existe una etiqueta con ese nombre."
          : "No se pudo actualizar la etiqueta.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const tagManagerBody = (
    <div className="space-y-3">
      {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Available tags */}
              <div className="space-y-1.5 max-h-[35vh] sm:max-h-40 overflow-y-auto">
                {availableTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay etiquetas. Crea una nueva.
                  </p>
                ) : (
                  availableTags.map(tag => (
                    <div key={tag.id} className="rounded-md hover:bg-secondary/50 group active:bg-secondary/70">
                      {editingTagId === tag.id ? (
                        <div className="p-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditTag();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-8 px-2"
                              onClick={saveEditTag}
                              disabled={!editName.trim() || saving}
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={cancelEdit}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {TAG_COLORS.map(color => (
                              <button
                                key={color}
                                onClick={() => setEditColor(color)}
                                className={`w-5 h-5 rounded-full transition-transform ${
                                  editColor === color ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => toggleTag(tag.id)}
                          className="flex items-center justify-between p-2 cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-sm">{tag.name}</span>
                            {togglingTagIds.has(tag.id) && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                guardando…
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {assignedTagIds.has(tag.id) && !togglingTagIds.has(tag.id) && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`w-8 h-8 md:w-6 md:h-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${canManageTags ? '' : 'hidden'}`}
                              onClick={(e) => startEditTag(tag, e)}
                              title="Editar etiqueta"
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`w-8 h-8 md:w-6 md:h-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${canManageTags ? '' : 'hidden'}`}
                              onClick={(e) => deleteTag(tag.id, e)}
                              title="Eliminar etiqueta"
                            >
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Create new tag (hidden for agents without permission) */}
              {canManageTags && (
              <div className="border-t pt-3 space-y-2 sticky bottom-0 bg-popover">
                <Label className="text-xs font-medium text-foreground">
                  + Crear nueva etiqueta
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nombre de la etiqueta..."
                    /* text-base (16px) evita el auto-zoom en iOS */
                    className="h-11 md:h-9 text-base md:text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && createTag()}
                  />
                  <Button
                    size="sm"
                    className="h-11 md:h-9 px-4 shrink-0"
                    onClick={createTag}
                    disabled={!newTagName.trim() || saving}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Color picker */}
                <div className="flex gap-2 flex-wrap">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      className={`w-8 h-8 md:w-5 md:h-5 rounded-full transition-transform ${
                        newTagColor === color ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
              </div>
              )}
            </>
          )}
    </div>
  );

  // On mobile, render as a Dialog (full centered modal) for better UX.
  // On desktop, keep the Popover anchored to the trigger button.
  if (isMobile) {
    return (
      <>
        {!hideTrigger && (
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 text-primary-foreground hover:bg-primary-foreground/10"
            title="Gestionar etiquetas"
            onClick={() => setOpen(true)}
          >
            <TagIcon className="w-4 h-4" />
          </Button>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[92vw] sm:max-w-md bg-popover z-[80]">
            <DialogHeader>
              <DialogTitle>Gestionar etiquetas</DialogTitle>
            </DialogHeader>
            {tagManagerBody}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {hideTrigger ? (
          <button
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
          />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 text-primary-foreground hover:bg-primary-foreground/10"
            title="Gestionar etiquetas"
          >
            <TagIcon className="w-4 h-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 bg-popover" align="start">
        <div className="font-medium text-sm mb-3">Gestionar etiquetas</div>
        {tagManagerBody}
      </PopoverContent>
    </Popover>
  );
};
