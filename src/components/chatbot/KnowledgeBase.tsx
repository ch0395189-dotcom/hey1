import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  HelpCircle, 
  Package, 
  Shield,
  Edit2,
  X,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface KnowledgeBaseProps {
  chatbotConfigId: string;
}

type KnowledgeEntryType = 'faq' | 'document' | 'product' | 'policy';

interface KnowledgeEntry {
  id: string;
  chatbot_config_id: string;
  title: string;
  content: string;
  category: string;
  type: KnowledgeEntryType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const typeIcons = {
  faq: HelpCircle,
  document: FileText,
  product: Package,
  policy: Shield,
};

const typeLabels = {
  faq: 'FAQ',
  document: 'Documento',
  product: 'Producto',
  policy: 'Política',
};

export const KnowledgeBase = ({ chatbotConfigId }: KnowledgeBaseProps) => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    category: string;
    type: KnowledgeEntryType;
    is_active: boolean;
  }>({
    title: '',
    content: '',
    category: 'general',
    type: 'faq',
    is_active: true,
  });

  useEffect(() => {
    fetchEntries();
  }, [chatbotConfigId]);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chatbot_knowledge_base')
      .select('*')
      .eq('chatbot_config_id', chatbotConfigId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching knowledge base:', error);
      toast.error('Error al cargar la base de conocimientos');
    } else {
      setEntries((data || []) as KnowledgeEntry[]);
    }
    setLoading(false);
  };

  const openAddDialog = () => {
    setEditingEntry(null);
    setFormData({
      title: '',
      content: '',
      category: 'general',
      type: 'faq',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setFormData({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      type: entry.type,
      is_active: entry.is_active,
    });
    setDialogOpen(true);
  };

  const saveEntry = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('El título y contenido son requeridos');
      return;
    }

    setSaving(true);
    try {
      if (editingEntry) {
        const { error } = await supabase
          .from('chatbot_knowledge_base')
          .update({
            title: formData.title,
            content: formData.content,
            category: formData.category,
            type: formData.type,
            is_active: formData.is_active,
          })
          .eq('id', editingEntry.id);

        if (error) throw error;
        toast.success('Entrada actualizada correctamente');
      } else {
        const { error } = await supabase
          .from('chatbot_knowledge_base')
          .insert({
            chatbot_config_id: chatbotConfigId,
            title: formData.title,
            content: formData.content,
            category: formData.category,
            type: formData.type,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success('Entrada agregada correctamente');
      }

      setDialogOpen(false);
      fetchEntries();
    } catch (error: any) {
      console.error('Error saving entry:', error);
      toast.error('Error al guardar la entrada');
    }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta entrada?')) return;

    const { error } = await supabase
      .from('chatbot_knowledge_base')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting entry:', error);
      toast.error('Error al eliminar la entrada');
    } else {
      toast.success('Entrada eliminada');
      fetchEntries();
    }
  };

  const toggleActive = async (entry: KnowledgeEntry) => {
    const { error } = await supabase
      .from('chatbot_knowledge_base')
      .update({ is_active: !entry.is_active })
      .eq('id', entry.id);

    if (error) {
      console.error('Error updating entry:', error);
      toast.error('Error al actualizar el estado');
    } else {
      fetchEntries();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Base de Conocimientos
            </CardTitle>
            <CardDescription>
              Entrena la IA con información de tu negocio, productos, FAQs y políticas
            </CardDescription>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay entradas en la base de conocimientos</p>
            <p className="text-sm">Agrega FAQs, documentos o información de productos para mejorar las respuestas de la IA</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {entries.map((entry) => {
                const Icon = typeIcons[entry.type];
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`p-4 border rounded-lg ${
                      entry.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {typeLabels[entry.type]}
                          </span>
                          {entry.category !== 'general' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                              {entry.category}
                            </span>
                          )}
                        </div>
                        <h4 className="font-medium truncate">{entry.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {entry.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={entry.is_active}
                          onCheckedChange={() => toggleActive(entry)}
                          aria-label="Activar/Desactivar"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(entry)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteEntry(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Editar Entrada' : 'Nueva Entrada'}
              </DialogTitle>
              <DialogDescription>
                Agrega información que la IA usará para responder a los clientes
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-type">Tipo</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: 'faq' | 'document' | 'product' | 'policy') =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger id="entry-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="faq">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4" />
                          FAQ / Pregunta Frecuente
                        </div>
                      </SelectItem>
                      <SelectItem value="document">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Documento / Información
                        </div>
                      </SelectItem>
                      <SelectItem value="product">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Producto / Servicio
                        </div>
                      </SelectItem>
                      <SelectItem value="policy">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Política / Regla
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-category">Categoría</Label>
                  <Input
                    id="entry-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="general, ventas, soporte..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry-title">
                  {formData.type === 'faq' ? 'Pregunta' : 'Título'}
                </Label>
                <Input
                  id="entry-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={
                    formData.type === 'faq'
                      ? '¿Cuáles son los horarios de atención?'
                      : 'Título de la entrada...'
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry-content">
                  {formData.type === 'faq' ? 'Respuesta' : 'Contenido'}
                </Label>
                <Textarea
                  id="entry-content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder={
                    formData.type === 'faq'
                      ? 'Nuestro horario de atención es de Lunes a Viernes de 9am a 6pm...'
                      : 'Contenido detallado...'
                  }
                  rows={6}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  id="entry-active"
                />
                <Label htmlFor="entry-active">Activo</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveEntry} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
