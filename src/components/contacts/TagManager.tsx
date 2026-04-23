import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Check, Loader2, Pencil } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

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

export const TagManager = ({ conversationId, onTagsChange }: TagManagerProps) => {
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
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

      const { data, error } = await supabase
        .from('contact_tags')
        .insert({
          user_id: user.id,
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
    
    try {
      if (isAssigned) {
        const { error } = await supabase
          .from('conversation_tags')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('tag_id', tagId);

        if (error) throw error;
        setAssignedTagIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(tagId);
          return newSet;
        });
      } else {
        const { error } = await supabase
          .from('conversation_tags')
          .insert({
            conversation_id: conversationId,
            tag_id: tagId,
          });

        if (error) throw error;
        setAssignedTagIds(prev => new Set([...prev, tagId]));
      }
      onTagsChange?.();
    } catch (error) {
      console.error('Error toggling tag:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la etiqueta.",
        variant: "destructive",
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-9 px-2 text-primary-foreground hover:bg-primary-foreground/10"
          title="Gestionar etiquetas"
        >
          <Plus className="w-4 h-4" />
          Etiquetas
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 bg-popover" align="start">
        <div className="space-y-3">
          <div className="font-medium text-sm">Gestionar etiquetas</div>
          
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Available tags */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {availableTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay etiquetas. Crea una nueva.
                  </p>
                ) : (
                  availableTags.map(tag => (
                    <div
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-secondary/50 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm">{tag.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {assignedTagIds.has(tag.id) && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => deleteTag(tag.id, e)}
                        >
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Create new tag */}
              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">Nueva etiqueta</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nombre..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && createTag()}
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2"
                    onClick={createTag}
                    disabled={!newTagName.trim() || saving}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
                
                {/* Color picker */}
                <div className="flex gap-1.5 flex-wrap">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        newTagColor === color ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
