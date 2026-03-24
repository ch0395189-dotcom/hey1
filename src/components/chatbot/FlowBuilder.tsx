import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronRight, MessageSquare, ArrowRight, User, CircleStop, MousePointer, List, Pencil, Upload, Image, Video, Music, FileText, X, CalendarDays } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MediaCaptureButtons } from './MediaCaptureButtons';
import { AppointmentConfig, defaultAppointmentSettings, type AppointmentSettings } from './AppointmentConfig';

interface FlowBuilderProps {
  chatbotConfigId: string;
}

interface ButtonOption {
  id: string;
  title: string;
  description?: string;
  response_type?: 'text' | 'media' | 'flow'; // Tipo de respuesta cuando se clickea
  response_content?: string; // Contenido de la respuesta (texto o URL de media)
  child_node_id?: string; // ID del nodo hijo si es tipo 'flow'
}

interface FlowNode {
  id: string;
  chatbot_config_id: string;
  parent_node_id: string | null;
  node_type: 'menu' | 'message' | 'action';
  trigger_type: 'option' | 'keyword' | 'start';
  trigger_value: string | null;
  title: string;
  content: string;
  action_type: string | null;
  position: number;
  interactive_type: 'none' | 'buttons' | 'list';
  button_options: ButtonOption[];
  media_url: string | null;
  media_type: string | null;
  children?: FlowNode[];
}

export const FlowBuilder = ({ chatbotConfigId }: FlowBuilderProps) => {
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [newNode, setNewNode] = useState({
    parent_node_id: null as string | null,
    node_type: 'menu' as 'menu' | 'message' | 'action',
    trigger_type: 'start' as 'option' | 'keyword' | 'start',
    trigger_value: '',
    title: '',
    content: '',
    action_type: null as string | null,
    interactive_type: 'none' as 'none' | 'buttons' | 'list',
    button_options: [] as ButtonOption[],
    media_url: null as string | null,
    media_type: null as string | null,
  });
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNodes();
  }, [chatbotConfigId]);

  const fetchNodes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chatbot_flow_nodes')
      .select('*')
      .eq('chatbot_config_id', chatbotConfigId)
      .order('position');

    if (data) {
      // Build tree structure
      const nodeMap = new Map<string | null, FlowNode[]>();
      (data as any[]).forEach(node => {
        const parentId = node.parent_node_id;
        const flowNode: FlowNode = {
          ...node,
          interactive_type: node.interactive_type || 'none',
          button_options: Array.isArray(node.button_options) ? node.button_options : [],
          children: [],
        };
        if (!nodeMap.has(parentId)) {
          nodeMap.set(parentId, []);
        }
        nodeMap.get(parentId)!.push(flowNode);
      });

      const rootNodes = nodeMap.get(null) || [];
      const buildTree = (nodes: FlowNode[]): FlowNode[] => {
        return nodes.map(node => ({
          ...node,
          children: buildTree(nodeMap.get(node.id) || []),
        }));
      };

      setNodes(buildTree(rootNodes));
    }
    setLoading(false);
  };

  const addButtonOption = () => {
    if (newNode.button_options.length >= (newNode.interactive_type === 'buttons' ? 3 : 10)) {
      toast.error(`Máximo ${newNode.interactive_type === 'buttons' ? 3 : 10} opciones permitidas`);
      return;
    }
    const newId = `opt_${Date.now()}`;
    setNewNode({
      ...newNode,
      button_options: [...newNode.button_options, { 
        id: newId, 
        title: '', 
        description: '',
        response_type: 'text',
        response_content: '',
      }],
    });
  };

  const updateButtonOption = (
    index: number, 
    field: 'title' | 'description' | 'response_type' | 'response_content', 
    value: string
  ) => {
    const updated = [...newNode.button_options];
    updated[index] = { ...updated[index], [field]: value };
    setNewNode({ ...newNode, button_options: updated });
  };

  const removeButtonOption = (index: number) => {
    setNewNode({
      ...newNode,
      button_options: newNode.button_options.filter((_, i) => i !== index),
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('El archivo no puede superar 16MB');
      return;
    }

    setUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `bot_media_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, file, { contentType: file.type });

      if (error) throw error;

      const { data: publicUrl } = supabase.storage
        .from('media')
        .getPublicUrl(data.path);

      let detectedType = 'document';
      if (file.type.startsWith('image/')) detectedType = 'image';
      else if (file.type.startsWith('video/')) detectedType = 'video';
      else if (file.type.startsWith('audio/')) detectedType = 'audio';

      setNewNode(prev => ({ ...prev, media_url: publicUrl.publicUrl, media_type: detectedType }));
      toast.success('Archivo subido correctamente');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Error al subir el archivo');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveNode = async () => {
    if (!newNode.title.trim() || !newNode.content.trim()) {
      toast.error('El título y contenido son requeridos');
      return;
    }

    // Validate button options
    if (newNode.interactive_type !== 'none') {
      if (newNode.button_options.length === 0) {
        toast.error('Agrega al menos una opción');
        return;
      }
      const invalidOptions = newNode.button_options.filter(opt => !opt.title.trim());
      if (invalidOptions.length > 0) {
        toast.error('Todas las opciones deben tener un título');
        return;
      }
    }

    // Clean up button options - ensure valid IDs and include response data
    const cleanedOptions = newNode.button_options.map((opt, idx) => ({
      id: opt.id || `opt_${idx + 1}`,
      title: opt.title.trim().substring(0, 20), // WhatsApp limit
      description: opt.description?.trim().substring(0, 72) || undefined, // WhatsApp limit
      response_type: opt.response_type || 'text',
      response_content: opt.response_content?.trim() || undefined,
    }));

    if (editingNode) {
      // Update existing node
      const { error } = await supabase
        .from('chatbot_flow_nodes')
        .update({
          parent_node_id: newNode.parent_node_id,
          node_type: newNode.node_type,
          trigger_type: newNode.trigger_type,
          trigger_value: newNode.trigger_value || null,
          title: newNode.title.trim(),
          content: newNode.content.trim(),
          action_type: newNode.action_type,
          interactive_type: newNode.interactive_type,
          button_options: cleanedOptions,
          media_url: newNode.media_url,
          media_type: newNode.media_type,
        })
        .eq('id', editingNode.id);

      if (error) {
        console.error('Error updating node:', error);
        toast.error('Error al actualizar el nodo');
        return;
      }

      await fetchNodes();
      resetForm();
      toast.success('Nodo actualizado correctamente');
    } else {
      // Insert new node
      const { data, error } = await supabase
        .from('chatbot_flow_nodes')
        .insert({
          chatbot_config_id: chatbotConfigId,
          parent_node_id: newNode.parent_node_id,
          node_type: newNode.node_type,
          trigger_type: newNode.trigger_type,
          trigger_value: newNode.trigger_value || null,
          title: newNode.title.trim(),
          content: newNode.content.trim(),
          action_type: newNode.action_type,
          position: nodes.length,
          interactive_type: newNode.interactive_type,
          button_options: cleanedOptions,
          media_url: newNode.media_url,
          media_type: newNode.media_type,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding node:', error);
        toast.error('Error al agregar el nodo');
        return;
      }

      await fetchNodes();
      resetForm();
      toast.success('Nodo agregado correctamente');
    }
  };

  const resetForm = () => {
    setNewNode({
      parent_node_id: null,
      node_type: 'menu',
      trigger_type: 'option',
      trigger_value: '',
      title: '',
      content: '',
      action_type: null,
      interactive_type: 'none',
      button_options: [],
      media_url: null,
      media_type: null,
    });
    setShowAddForm(false);
    setEditingNode(null);
  };

  const startEditNode = (node: FlowNode) => {
    setEditingNode(node);
    setNewNode({
      parent_node_id: node.parent_node_id,
      node_type: node.node_type,
      trigger_type: node.trigger_type,
      trigger_value: node.trigger_value || '',
      title: node.title,
      content: node.content,
      action_type: node.action_type,
      interactive_type: node.interactive_type || 'none',
      button_options: node.button_options || [],
      media_url: node.media_url || null,
      media_type: node.media_type || null,
    });
    setShowAddForm(true);
  };

  const deleteNode = async (id: string) => {
    const { error } = await supabase
      .from('chatbot_flow_nodes')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error al eliminar');
      return;
    }

    await fetchNodes();
    toast.success('Nodo eliminado');
  };

  const getAllFlatNodes = (nodes: FlowNode[]): FlowNode[] => {
    return nodes.reduce<FlowNode[]>((acc, node) => {
      acc.push(node);
      if (node.children) {
        acc.push(...getAllFlatNodes(node.children));
      }
      return acc;
    }, []);
  };

  const renderNode = (node: FlowNode, depth: number = 0) => {
    const getNodeIcon = () => {
      switch (node.node_type) {
        case 'menu': return <MessageSquare className="h-4 w-4" />;
        case 'message': return <ArrowRight className="h-4 w-4" />;
        case 'action': return node.action_type === 'escalate' 
          ? <User className="h-4 w-4" /> 
          : <CircleStop className="h-4 w-4" />;
        default: return null;
      }
    };

    const getTriggerBadge = () => {
      if (node.trigger_type === 'start') return '🚀 Inicio';
      if (node.trigger_type === 'keyword') return `🔑 "${node.trigger_value}"`;
      if (node.trigger_type === 'option') return `#${node.trigger_value}`;
      return null;
    };

    const getInteractiveBadge = () => {
      if (node.interactive_type === 'buttons') {
        return (
          <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full flex items-center gap-1">
            <MousePointer className="h-3 w-3" />
            {node.button_options?.length || 0} botones
          </span>
        );
      }
      if (node.interactive_type === 'list') {
        return (
          <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded-full flex items-center gap-1">
            <List className="h-3 w-3" />
            Lista ({node.button_options?.length || 0})
          </span>
        );
      }
      return null;
    };

    return (
      <motion.div
        key={node.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-2"
        style={{ marginLeft: depth * 24 }}
      >
        <div className="flex items-start gap-2 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 text-muted-foreground">
            {depth > 0 && <ChevronRight className="h-4 w-4" />}
            {getNodeIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{node.title}</span>
              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                {getTriggerBadge()}
              </span>
              {getInteractiveBadge()}
              {node.media_url && (
                <span className="text-xs px-2 py-0.5 bg-accent text-accent-foreground rounded-full flex items-center gap-1">
                  {node.media_type === 'image' ? <Image className="h-3 w-3" /> : 
                   node.media_type === 'video' ? <Video className="h-3 w-3" /> :
                   node.media_type === 'audio' ? <Music className="h-3 w-3" /> :
                   <FileText className="h-3 w-3" />}
                  {node.media_type}
                </span>
              )}
              {node.action_type && (
                <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded-full">
                  {node.action_type === 'escalate' ? 'Escalar' : 'Finalizar'}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{node.content}</p>
            {node.button_options && node.button_options.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {node.button_options.map((opt, idx) => (
                  <span key={idx} className="text-xs px-2 py-0.5 bg-muted rounded border">
                    {opt.title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => startEditNode(node)}
              title="Editar nodo"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setNewNode({
                  ...newNode,
                  parent_node_id: node.id,
                  trigger_type: 'option',
                });
                setShowAddForm(true);
              }}
              title="Agregar respuesta"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteNode(node.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {node.children && node.children.length > 0 && (
          <div className="space-y-2">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const flatNodes = getAllFlatNodes(nodes);
  // Exclude editing node and its children from parent selection
  const availableParentNodes = editingNode 
    ? flatNodes.filter(n => n.id !== editingNode.id)
    : flatNodes;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Constructor de Flujo</CardTitle>
            <CardDescription>
              Crea flujos con botones interactivos y listas para WhatsApp
            </CardDescription>
          </div>
          <Button onClick={() => {
            setEditingNode(null);
            setNewNode({
              parent_node_id: null,
              node_type: 'menu',
              trigger_type: nodes.length === 0 ? 'start' : 'option',
              trigger_value: '',
              title: '',
              content: '',
              action_type: null,
              interactive_type: 'none',
              button_options: [],
              media_url: null,
              media_type: null,
            });
            setShowAddForm(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            {nodes.length === 0 ? 'Crear Inicio' : 'Agregar Nodo'}
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">
                  {editingNode ? '✏️ Editar Nodo' : '➕ Nuevo Nodo'}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={newNode.title}
                    onChange={(e) => setNewNode({ ...newNode, title: e.target.value })}
                    placeholder="ej: Menú Principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Nodo</Label>
                  <Select
                    value={newNode.node_type}
                    onValueChange={(value: 'menu' | 'message' | 'action') => 
                      setNewNode({ ...newNode, node_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="menu">Menú de Opciones</SelectItem>
                      <SelectItem value="message">Mensaje</SelectItem>
                      <SelectItem value="action">Acción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Activación</Label>
                  <Select
                    value={newNode.trigger_type}
                    onValueChange={(value: 'option' | 'keyword' | 'start') => 
                      setNewNode({ ...newNode, trigger_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="start">Inicio de Conversación</SelectItem>
                      <SelectItem value="option">Opción Numérica (1, 2, 3...)</SelectItem>
                      <SelectItem value="keyword">Palabra Clave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newNode.trigger_type !== 'start' && (
                  <div className="space-y-2">
                    <Label>Valor de Activación</Label>
                    <Input
                      value={newNode.trigger_value}
                      onChange={(e) => setNewNode({ ...newNode, trigger_value: e.target.value })}
                      placeholder={newNode.trigger_type === 'option' ? '1' : 'palabra clave'}
                    />
                  </div>
                )}
              </div>

              {availableParentNodes.length > 0 && (
                <div className="space-y-2">
                  <Label>Nodo Padre (opcional)</Label>
                  <Select
                    value={newNode.parent_node_id || 'none'}
                    onValueChange={(value) => 
                      setNewNode({ ...newNode, parent_node_id: value === 'none' ? null : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ninguno (nodo raíz)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguno (nodo raíz)</SelectItem>
                      {availableParentNodes.map(node => (
                        <SelectItem key={node.id} value={node.id}>
                          {node.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Contenido del Mensaje</Label>
                <Textarea
                  value={newNode.content}
                  onChange={(e) => setNewNode({ ...newNode, content: e.target.value })}
                  placeholder="El mensaje que el bot enviará..."
                  rows={3}
                />
              </div>

              {/* Media Attachment */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Archivo Multimedia (opcional)
                </Label>
                {newNode.media_url ? (
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {newNode.media_type === 'image' && <Image className="h-5 w-5 text-primary shrink-0" />}
                      {newNode.media_type === 'video' && <Video className="h-5 w-5 text-primary shrink-0" />}
                      {newNode.media_type === 'audio' && <Music className="h-5 w-5 text-primary shrink-0" />}
                      {newNode.media_type === 'document' && <FileText className="h-5 w-5 text-primary shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">{newNode.media_type}</p>
                        <p className="text-xs text-muted-foreground truncate">{newNode.media_url}</p>
                      </div>
                    </div>
                    {newNode.media_type === 'image' && (
                      <img src={newNode.media_url} alt="Preview" className="h-12 w-12 object-cover rounded" />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setNewNode({ ...newNode, media_url: null, media_type: null })}
                      className="text-destructive shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleMediaUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingMedia}
                      className="w-full"
                    >
                      {uploadingMedia ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          Subiendo...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Subir imagen, video, audio o documento
                        </div>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      El archivo se enviará junto con el mensaje de texto del nodo
                    </p>
                  </div>
                )}
              </div>

              {/* Interactive Type Selection */}
              <div className="space-y-2">
                <Label>Tipo de Interacción</Label>
                <Select
                  value={newNode.interactive_type}
                  onValueChange={(value: 'none' | 'buttons' | 'list') => {
                    setNewNode({ 
                      ...newNode, 
                      interactive_type: value,
                      button_options: value === 'none' ? [] : newNode.button_options,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Texto simple</SelectItem>
                    <SelectItem value="buttons">Botones de respuesta rápida (máx. 3)</SelectItem>
                    <SelectItem value="list">Lista de opciones (máx. 10)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Button/List Options */}
              {newNode.interactive_type !== 'none' && (
                <div className="space-y-3 p-3 border rounded-lg bg-background">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      {newNode.interactive_type === 'buttons' ? (
                        <><MousePointer className="h-4 w-4" /> Botones</>
                      ) : (
                        <><List className="h-4 w-4" /> Opciones de Lista</>
                      )}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addButtonOption}
                      disabled={newNode.button_options.length >= (newNode.interactive_type === 'buttons' ? 3 : 10)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar
                    </Button>
                  </div>
                  
                  {newNode.button_options.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Agrega opciones que el usuario podrá seleccionar
                    </p>
                  )}

                  {newNode.button_options.map((option, index) => (
                    <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground min-w-[60px]">
                              Botón {index + 1}
                            </span>
                            <Input
                              value={option.title}
                              onChange={(e) => updateButtonOption(index, 'title', e.target.value)}
                              placeholder="Título del botón (máx. 20)"
                              maxLength={20}
                              className="flex-1"
                            />
                          </div>
                          {newNode.interactive_type === 'list' && (
                            <Input
                              value={option.description || ''}
                              onChange={(e) => updateButtonOption(index, 'description', e.target.value)}
                              placeholder="Descripción (opcional, máx. 72)"
                              maxLength={72}
                            />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeButtonOption(index)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Respuesta al hacer click */}
                      <div className="pl-[68px] space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Respuesta al seleccionar este botón:
                        </Label>
                        <Select
                          value={option.response_type || 'text'}
                          onValueChange={(value) => updateButtonOption(index, 'response_type', value)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Mensaje de texto</SelectItem>
                            <SelectItem value="media">Archivo multimedia (URL)</SelectItem>
                            <SelectItem value="flow">Continuar con otro nodo</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {option.response_type !== 'flow' && (
                          <Textarea
                            value={option.response_content || ''}
                            onChange={(e) => updateButtonOption(index, 'response_content', e.target.value)}
                            placeholder={
                              option.response_type === 'media' 
                                ? "URL del archivo (imagen, video, documento)..." 
                                : "Mensaje de respuesta..."
                            }
                            rows={2}
                            className="text-sm"
                          />
                        )}
                        
                        {option.response_type === 'flow' && (
                          <p className="text-xs text-muted-foreground italic">
                            💡 Crea un nodo hijo con este nodo como padre para continuar el flujo
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {newNode.node_type === 'action' && (
                <div className="space-y-2">
                  <Label>Tipo de Acción</Label>
                  <Select
                    value={newNode.action_type || 'end'}
                    onValueChange={(value) => setNewNode({ ...newNode, action_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="escalate">Escalar a Humano</SelectItem>
                      <SelectItem value="end">Finalizar Conversación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button onClick={saveNode}>
                  {editingNode ? 'Actualizar Nodo' : 'Guardar Nodo'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {nodes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No hay flujo configurado</p>
            <p className="text-sm">Crea un nodo de inicio para comenzar el flujo de conversación</p>
          </div>
        ) : (
          <div className="space-y-2">
            {nodes.map(node => renderNode(node))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
