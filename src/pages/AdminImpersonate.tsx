import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { setImpersonation } from "@/lib/effectiveAuth";
import { toast } from "sonner";

const AdminImpersonate = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading } = useAdminCheck();

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!userId) {
      navigate("/admin", { replace: true });
      return;
    }
    (async () => {
      try {
        // Fetch target profile + email for the banner + audit log
        const [{ data: prof }, { data: authUsers }, { data: session }] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
          supabase.functions.invoke("admin-get-users"),
          supabase.auth.getSession(),
        ]);
        const adminId = session?.session?.user?.id;
        const list = ((authUsers as any)?.data?.users || (authUsers as any)?.users || []) as { id: string; email?: string }[];
        const match = list.find((u) => u.id === userId);

        // Insert audit log
        let logId: string | undefined;
        try {
          const { data: log } = await supabase
            .from("admin_impersonation_log")
            .insert({
              admin_id: adminId,
              target_user_id: userId,
              user_agent: navigator.userAgent.slice(0, 500),
            })
            .select("id")
            .single();
          logId = log?.id;
        } catch (e) { console.warn("impersonation log failed", e); }

        setImpersonation(userId, {
          email: match?.email,
          name: prof?.full_name || undefined,
          adminId,
          logId,
        });
        toast.success(`Entrando como ${match?.email || prof?.full_name || userId}`);
        navigate("/dashboard", { replace: true });
      } catch (e) {
        console.error(e);
        toast.error("No se pudo iniciar la sesión de impersonación");
        navigate("/admin", { replace: true });
      }
    })();
  }, [userId, isAdmin, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
};

export default AdminImpersonate;