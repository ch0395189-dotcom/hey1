import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCog, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface Props {
  conversationId: string;
  currentAssignee: string | null;
  onAssigned?: () => void;
  onOpenChange?: (open: boolean) => void;
}

interface AgentOption {
  agent_user_id: string;
  agent_email: string;
  agent_name: string | null;
}

export const AssignAgentMenu = ({ conversationId, currentAssignee, onAssigned, onOpenChange }: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMe(user.id);
      // Am I an agent? if so, hide menu
      const { data: agentRow } = await supabase
        .from("team_agents")
        .select("owner_id")
        .eq("agent_user_id", user.id)
        .maybeSingle();
      if (agentRow) {
        setIsOwner(false);
        return;
      }
      setIsOwner(true);
      const { data } = await supabase
        .from("team_agents")
        .select("agent_user_id, agent_email, agent_name")
        .eq("owner_id", user.id)
        .eq("is_active", true);
      setAgents((data as AgentOption[]) ?? []);
    };
    load();
  }, []);

  if (!isOwner) return null;

  const handleOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onOpenChange?.(open);
  };

  const assign = async (agentId: string | null) => {
    setLoading(true);
    const { error } = await supabase.rpc("assign_conversation", {
      p_conversation_id: conversationId,
      p_agent_user_id: agentId as any,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: agentId ? "Conversación asignada" : "Asignación removida" });
    handleOpenChange(false);
    onAssigned?.();
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-primary-foreground hover:bg-primary-foreground/10 touch-manipulation"
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") {
              event.preventDefault();
              handleOpenChange(!menuOpen);
            }
          }}
          title="Asignar agente"
          aria-label="Asignar agente"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card w-56">
        <DropdownMenuLabel>Asignar a</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => assign(me)}>
          {currentAssignee === me && <Check className="w-3 h-3 mr-2" />}
          <span className={currentAssignee === me ? "" : "ml-5"}>Yo (propietario)</span>
        </DropdownMenuItem>
        {agents.map((a) => (
          <DropdownMenuItem key={a.agent_user_id} onClick={() => assign(a.agent_user_id)}>
            {currentAssignee === a.agent_user_id && <Check className="w-3 h-3 mr-2" />}
            <span className={currentAssignee === a.agent_user_id ? "" : "ml-5"}>
              {a.agent_name || a.agent_email}
            </span>
          </DropdownMenuItem>
        ))}
        {agents.length === 0 && (
          <DropdownMenuItem
            onClick={() => navigate("/dashboard?view=team")}
            className="text-primary"
          >
            + Invitar agentes
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => assign(null)} className="text-muted-foreground">
          Sin asignar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};