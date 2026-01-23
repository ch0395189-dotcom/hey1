import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface KeywordManagerProps {
  chatbotConfigId: string;
}

interface Keyword {
  id: string;
  keyword: string;
  response: string;
  is_exact_match: boolean;
  priority: number;
}

export const KeywordManager = ({ chatbotConfigId }: KeywordManagerProps) => {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState({
    keyword: '',
    response: '',
    is_exact_match: false,
    priority: 0,
  });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchKeywords();
  }, [chatbotConfigId]);

  const fetchKeywords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chatbot_keywords')
      .select('*')
      .eq('chatbot_config_id', chatbotConfigId)
      .order('priority', { ascending: false });

    if (data) {
      setKeywords(data as Keyword[]);
    }
    setLoading(false);
  };

  const addKeyword = async () => {
    if (!newKeyword.keyword.trim() || !newKeyword.response.trim()) {
      toast.error('La palabra clave y la respuesta son requeridas');
      return;
    }

    const { data, error } = await supabase
      .from('chatbot_keywords')
      .insert({
        chatbot_config_id: chatbotConfigId,
        keyword: newKeyword.keyword.trim(),
        response: newKeyword.response.trim(),
        is_exact_match: newKeyword.is_exact_match,
        priority: newKeyword.priority,
      })
      .select()
      .single();

    if (error) {
      toast.error('Error al agregar la palabra clave');
      return;
    }

    if (data) {
      setKeywords([data as Keyword, ...keywords]);
      setNewKeyword({ keyword: '', response: '', is_exact_match: false, priority: 0 });
      setShowAddForm(false);
      toast.success('Palabra clave agregada');
    }
  };

  const updateKeyword = async (id: string, updates: Partial<Keyword>) => {
    const { error } = await supabase
      .from('chatbot_keywords')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast.error('Error al actualizar');
      return;
    }

    setKeywords(keywords.map(k => k.id === id ? { ...k, ...updates } : k));
    setEditingId(null);
    toast.success('Actualizado correctamente');
  };

  const deleteKeyword = async (id: string) => {
    const { error } = await supabase
      .from('chatbot_keywords')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error al eliminar');
      return;
    }

    setKeywords(keywords.filter(k => k.id !== id));
    toast.success('Palabra clave eliminada');
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
            <CardTitle>Palabras Clave</CardTitle>
            <CardDescription>
              Define respuestas automáticas basadas en palabras o frases específicas
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border rounded-lg p-4 space-y-4 bg-muted/50"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Palabra Clave</Label>
                  <Input
                    value={newKeyword.keyword}
                    onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                    placeholder="ej: precio, horario, ubicación"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prioridad</Label>
                  <Input
                    type="number"
                    value={newKeyword.priority}
                    onChange={(e) => setNewKeyword({ ...newKeyword, priority: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Respuesta</Label>
                <Textarea
                  value={newKeyword.response}
                  onChange={(e) => setNewKeyword({ ...newKeyword, response: e.target.value })}
                  placeholder="La respuesta que el bot enviará..."
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newKeyword.is_exact_match}
                    onCheckedChange={(checked) => setNewKeyword({ ...newKeyword, is_exact_match: checked })}
                    id="exact-match"
                  />
                  <Label htmlFor="exact-match" className="text-sm">
                    Coincidencia exacta
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={addKeyword}>
                    Guardar
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {keywords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay palabras clave configuradas</p>
            <p className="text-sm">Agrega palabras clave para respuestas automáticas</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Palabra Clave</TableHead>
                <TableHead>Respuesta</TableHead>
                <TableHead className="w-24">Prioridad</TableHead>
                <TableHead className="w-24">Exacta</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.map((kw) => (
                <TableRow key={kw.id}>
                  <TableCell className="font-medium">{kw.keyword}</TableCell>
                  <TableCell className="max-w-xs truncate">{kw.response}</TableCell>
                  <TableCell>{kw.priority}</TableCell>
                  <TableCell>
                    <Switch
                      checked={kw.is_exact_match}
                      onCheckedChange={(checked) => updateKeyword(kw.id, { is_exact_match: checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteKeyword(kw.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
