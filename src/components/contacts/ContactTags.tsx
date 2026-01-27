import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ContactTagsProps {
  conversationId: string;
  maxDisplay?: number;
}

export const ContactTags = ({ conversationId, maxDisplay = 3 }: ContactTagsProps) => {
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    fetchTags();
  }, [conversationId]);

  const fetchTags = async () => {
    const { data, error } = await supabase
      .from('conversation_tags')
      .select(`
        tag_id,
        contact_tags (
          id,
          name,
          color
        )
      `)
      .eq('conversation_id', conversationId);

    if (!error && data) {
      const fetchedTags = data
        .map((ct: any) => ct.contact_tags)
        .filter(Boolean) as Tag[];
      setTags(fetchedTags);
    }
  };

  if (tags.length === 0) return null;

  const displayTags = tags.slice(0, maxDisplay);
  const remainingCount = tags.length - maxDisplay;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {displayTags.map(tag => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-4 font-normal"
          style={{ 
            backgroundColor: `${tag.color}20`,
            color: tag.color,
            borderColor: `${tag.color}40`,
          }}
        >
          {tag.name}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-4 font-normal"
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
};
