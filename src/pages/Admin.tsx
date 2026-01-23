import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { UsersTable } from '@/components/admin/UsersTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Shield, Users } from 'lucide-react';

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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Panel de Administración</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
      </main>
    </div>
  );
};

export default Admin;
