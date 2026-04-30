import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MessageUsage {
  messages_sent: number;
  extra_messages: number;
  base_limit: number;
  total_limit: number;
  period_month: string;
  percentage: number;
}

export function useMessageLimit() {
  const [usage, setUsage] = useState<MessageUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_message_usage");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setUsage({
          messages_sent: Number(row.messages_sent ?? 0),
          extra_messages: Number(row.extra_messages ?? 0),
          base_limit: Number(row.base_limit ?? 0),
          total_limit: Number(row.total_limit ?? 0),
          period_month: String(row.period_month ?? ""),
          percentage: Number(row.percentage ?? 0),
        });
      }
    } catch (err) {
      console.error("Error loading message usage:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const blocked = !!usage && usage.messages_sent >= usage.total_limit;
  const warning = !!usage && !blocked && usage.percentage >= 80;

  return { usage, loading, blocked, warning, refresh };
}
