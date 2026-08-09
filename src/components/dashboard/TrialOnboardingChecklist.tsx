import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight, Rocket } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getImpersonationId } from "@/lib/effectiveAuth";

interface Step {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  action: () => void;
}

/**
 * Activation checklist shown while the user is on trial. The trial dies when
 * people never finish onboarding, so we surface the remaining steps inline.
 */
export const TrialOnboardingChecklist = () => {
  const [loading, setLoading] = useState(true);
  const [isTrial, setIsTrial] = useState(false);
  const [hasWhatsapp, setHasWhatsapp] = useState(false);
  const [hasBot, setHasBot] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("trial_checklist_dismissed") === "1"
  );

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const uid = getImpersonationId() || session.user.id;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, trial_end")
        .eq("user_id", uid)
        .maybeSingle();

      const trialing =
        sub?.status === "trialing" && !!sub.trial_end && new Date(sub.trial_end) > new Date();
      setIsTrial(trialing);

      if (trialing) {
        const { data: accounts } = await supabase
          .from("whatsapp_accounts")
          .select("id")
          .eq("user_id", uid);
        const ids = (accounts || []).map((a) => a.id);
        setHasWhatsapp(ids.length > 0);

        if (ids.length > 0) {
          const { data: bots } = await supabase
            .from("chatbot_configs")
            .select("id")
            .in("whatsapp_account_id", ids)
            .eq("is_enabled", true)
            .limit(1);
          setHasBot((bots || []).length > 0);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const go = (view: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    window.location.search = params.toString();
  };

  if (loading || !isTrial || dismissed) return null;

  const steps: Step[] = [
    {
      key: "whatsapp",
      label: "Conecta tu número de WhatsApp",
      hint: "2 minutos. Desde aquí recibes todos tus chats.",
      done: hasWhatsapp,
      action: () => go("settings"),
    },
    {
      key: "bot",
      label: "Activa tu bot de respuestas",
      hint: "Un saludo y 2 respuestas bastan para empezar.",
      done: hasBot,
      action: () => go("chatbot"),
    },
  ];

  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) return null;

  const dismiss = () => {
    localStorage.setItem("trial_checklist_dismissed", "1");
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-primary/20 bg-primary/5 rounded-xl px-3 py-2.5 md:px-4 md:py-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Rocket className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-xs md:text-sm font-medium text-foreground flex-1">
          Termina de activar tu cuenta ({steps.length - pending.length}/{steps.length})
        </p>
        <button
          onClick={dismiss}
          className="text-[10px] md:text-xs text-muted-foreground hover:text-foreground"
        >
          Ocultar
        </button>
      </div>
      <div className="space-y-1">
        {steps.map((s) => (
          <button
            key={s.key}
            onClick={s.done ? undefined : s.action}
            disabled={s.done}
            className={`w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 transition-colors ${
              s.done ? "opacity-60" : "hover:bg-primary/10"
            }`}
          >
            {s.done ? (
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-xs md:text-sm text-foreground truncate">{s.label}</span>
              {!s.done && (
                <span className="block text-[10px] md:text-xs text-muted-foreground truncate">
                  {s.hint}
                </span>
              )}
            </span>
            {!s.done && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
};