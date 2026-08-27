import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BuyNumberPanel } from "@/components/numbers/BuyNumberPanel";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";

const BuyNumber = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = "Comprar número virtual | HeyHey";
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/login", { replace: true });
      else setReady(true);
    });
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Comprar número virtual</h1>
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard?view=whatsapp")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Ir a conectar WhatsApp
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Deja esta pestaña abierta mientras completas la conexión de WhatsApp Business en la otra
        pestaña: aquí verás el número asignado y el código SMS en tiempo real.
      </p>
      <BuyNumberPanel />
    </main>
  );
};

export default BuyNumber;
