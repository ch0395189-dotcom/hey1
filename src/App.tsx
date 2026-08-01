import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { usePersistentStorage } from "@/hooks/usePersistentStorage";
import { MetaPixelProvider } from "@/components/tracking/MetaPixelProvider";
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
// Heavy / less-frequent routes are lazy-loaded so they don't bloat the
// initial JS bundle. This speeds up first paint for everyone.
const Admin = lazy(() => import("./pages/Admin"));
const AdminInbox = lazy(() => import("./pages/AdminInbox"));
const AdminImpersonate = lazy(() => import("./pages/AdminImpersonate"));
const Payments = lazy(() => import("./pages/Payments"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const Install = lazy(() => import("./pages/Install"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
import { InstallAppBanner } from "@/components/install/InstallAppBanner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { NativePushBootstrap } from "@/components/NativePushBootstrap";
import { Capacitor } from "@capacitor/core";

const isNativeAppShell =
  typeof window !== "undefined" && Capacitor.isNativePlatform();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: !isNativeAppShell,
      refetchOnReconnect: true,
      retry: 2,
    },
  },
});

// Precarga en segundo plano (cuando el navegador está ocioso) las rutas a las
// que el usuario casi siempre va después de abrir la app. Así al pulsar
// "Entrar" o al redirigir al dashboard el chunk ya está en caché.
function prefetchLikelyRoutes() {
  if (typeof window === "undefined") return;
  const run = () => {
    void import("./pages/Dashboard");
    void import("./pages/Login");
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(run);
  else setTimeout(run, 1200);
}

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const App = () => {
  useEffect(() => {
    prefetchLikelyRoutes();
  }, []);

  // Reduce unexpected logouts on older/low-storage phones by requesting
  // persistent storage (when the browser supports it).
  usePersistentStorage();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <MetaPixelProvider />
        <BrowserRouter>
          <UpdateBanner />
          <ImpersonationBanner />
          <NativePushBootstrap />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/inbox/:userId" element={<AdminInbox />} />
              <Route path="/admin/impersonate/:userId" element={<AdminImpersonate />} />
              <Route path="/admin/payments" element={<Payments />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/data-deletion" element={<DataDeletion />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/update-password" element={<UpdatePassword />} />
              <Route path="/install" element={<Install />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <InstallAppBanner />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
