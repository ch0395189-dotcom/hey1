import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { UsersTable } from '@/components/admin/UsersTable';
import { ManualPayments } from '@/components/admin/ManualPayments';
import { PaymentAlerts } from '@/components/admin/PaymentAlerts';
import { CreditPackagesManager } from '@/components/admin/CreditPackagesManager';
import { CreditPurchasesManager } from '@/components/admin/CreditPurchasesManager';
import { AdminStatistics } from '@/components/admin/AdminStatistics';
import { CloneBotManager } from '@/components/admin/CloneBotManager';
import { PhoneNumbersTable } from '@/components/admin/PhoneNumbersTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Shield, Users, CreditCard, Bell, Coins, BarChart3, Bot, Phone } from 'lucide-react';

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAdminCheck();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
              <h1 className="text-base sm:text-xl font-bold truncate">Panel de Administración</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full sm:max-w-3xl grid-cols-7 h-auto">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuarios</span>
            </TabsTrigger>
            <TabsTrigger value="phones" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">Números</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Pagos</span>
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              <span className="hidden sm:inline">Créditos</span>
            </TabsTrigger>
            <TabsTrigger value="bots" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Bots</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
            <TabsTrigger value="statistics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Estadísticas</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle>Gestión de Usuarios</CardTitle>
                </div>
                <CardDescription>
                  Administra usuarios, suscripciones y realiza activaciones manuales
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsersTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="phones">
            <PhoneNumbersTable />
          </TabsContent>

          <TabsContent value="payments">
            <ManualPayments />
          </TabsContent>

          <TabsContent value="credits" className="space-y-6">
            <CreditPackagesManager />
            <CreditPurchasesManager />
          </TabsContent>

          <TabsContent value="bots">
            <CloneBotManager />
          </TabsContent>

          <TabsContent value="alerts">
            <PaymentAlerts />
          </TabsContent>

          <TabsContent value="statistics">
            <AdminStatistics />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
