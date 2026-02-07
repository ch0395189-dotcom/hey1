import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Coins } from 'lucide-react';
import { toast } from 'sonner';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_cop: number;
  price_usd: number | null;
  is_active: boolean;
  is_popular: boolean;
}

export const CreditPackagesManager = () => {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    credits: 100,
    price_cop: 10000,
    price_usd: 2.5,
    is_active: true,
    is_popular: false,
  });

  const fetchPackages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_packages')
      .select('*')
      .order('credits', { ascending: true });

    if (error) {
      console.error('Error fetching packages:', error);
      toast.error('Error al cargar paquetes');
    } else {
      setPackages(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const handleSave = async () => {
    try {
      if (editingPackage) {
        const { error } = await supabase
          .from('credit_packages')
          .update(formData)
          .eq('id', editingPackage.id);

        if (error) throw error;
        toast.success('Paquete actualizado');
      } else {
        const { error } = await supabase
          .from('credit_packages')
          .insert(formData);

        if (error) throw error;
        toast.success('Paquete creado');
      }

      setDialogOpen(false);
      setEditingPackage(null);
      setFormData({
        name: '',
        credits: 100,
        price_cop: 10000,
        price_usd: 2.5,
        is_active: true,
        is_popular: false,
      });
      fetchPackages();
    } catch (error) {
      console.error('Error saving package:', error);
      toast.error('Error al guardar paquete');
    }
  };

  const handleEdit = (pkg: CreditPackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      credits: pkg.credits,
      price_cop: pkg.price_cop,
      price_usd: pkg.price_usd || 0,
      is_active: pkg.is_active,
      is_popular: pkg.is_popular,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este paquete?')) return;

    const { error } = await supabase
      .from('credit_packages')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error al eliminar paquete');
    } else {
      toast.success('Paquete eliminado');
      fetchPackages();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          <CardTitle>Paquetes de Créditos</CardTitle>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingPackage(null);
              setFormData({
                name: '',
                credits: 100,
                price_cop: 10000,
                price_usd: 2.5,
                is_active: true,
                is_popular: false,
              });
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Paquete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPackage ? 'Editar Paquete' : 'Nuevo Paquete'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre del paquete"
                />
              </div>
              <div>
                <Label>Créditos</Label>
                <Input
                  type="number"
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Precio COP</Label>
                  <Input
                    type="number"
                    value={formData.price_cop}
                    onChange={(e) => setFormData({ ...formData, price_cop: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Precio USD</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price_usd}
                    onChange={(e) => setFormData({ ...formData, price_usd: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Activo</Label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Destacado (Popular)</Label>
                <Switch
                  checked={formData.is_popular}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_popular: checked })}
                />
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingPackage ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Créditos</TableHead>
              <TableHead>Precio COP</TableHead>
              <TableHead>Precio USD</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Popular</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow key={pkg.id}>
                <TableCell className="font-medium">{pkg.name}</TableCell>
                <TableCell>{pkg.credits.toLocaleString()}</TableCell>
                <TableCell>${pkg.price_cop.toLocaleString()}</TableCell>
                <TableCell>${pkg.price_usd || '-'}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    pkg.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {pkg.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </TableCell>
                <TableCell>{pkg.is_popular ? '⭐' : '-'}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(pkg)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(pkg.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
