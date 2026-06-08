import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, User, Phone, MessageCircle, MoreVertical, UserPlus, Trash2, CheckSquare, X, Send, RefreshCw, Ban, UserCheck, Tag, Archive, ArchiveRestore } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkMessageDialog } from "./BulkMessageDialog";
import { TagManager } from "./TagManager";
import { ContactTags } from "./ContactTags";
import { useAutoRefresh, useAutoRefreshSettings } from "@/hooks/useAutoRefresh";
import { PullToRefreshContainer } from "@/components/ui/PullToRefreshContainer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  last_message_at: string;
  unread_count: number;
  whatsapp_account_id: string;
  blocked_at: string | null;
  is_archived: boolean;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ConversationTagMap {
  [conversationId: string]: string[];
}

export const ContactsList = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkMessageDialog, setShowBulkMessageDialog] = useState(false);
  const [blockingContact, setBlockingContact] = useState<Contact | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tagsRefreshKey, setTagsRefreshKey] = useState(0);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(new Set());
  const [conversationTagMap, setConversationTagMap] = useState<ConversationTagMap>({});
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [singleSendContact, setSingleSendContact] = useState<Contact | null>(null);
  const { toast } = useToast();

  const handleTagsChange = useCallback(() => {
    setTagsRefreshKey(prev => prev + 1);
    fetchTagsData();
  }, []);

  const fetchTagsData = useCallback(async () => {
    // Fetch all available tags
    const { data: tags } = await supabase
      .from('contact_tags')
      .select('*')
      .order('name');
    
    if (tags) setAvailableTags(tags);

    // Fetch all conversation-tag mappings
    const { data: convTags } = await supabase
      .from('conversation_tags')
      .select('conversation_id, tag_id');

    if (convTags) {
      const tagMap: ConversationTagMap = {};
      convTags.forEach(ct => {
        if (!tagMap[ct.conversation_id]) {
          tagMap[ct.conversation_id] = [];
        }
        tagMap[ct.conversation_id].push(ct.tag_id);
      });
      setConversationTagMap(tagMap);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchTagsData();
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('id, customer_name, customer_phone, customer_profile_pic, last_message_at, unread_count, whatsapp_account_id, blocked_at, is_archived')
      .eq('is_archived', false)
      .order('customer_name', { ascending: true });

    if (!error && data) {
      // Remove duplicates by phone number, keeping the most recent
      const uniqueContacts = data.reduce((acc: Contact[], curr) => {
        const existing = acc.find(c => c.customer_phone === curr.customer_phone);
        if (!existing) {
          acc.push(curr);
        } else if (new Date(curr.last_message_at) > new Date(existing.last_message_at)) {
          const index = acc.indexOf(existing);
          acc[index] = curr;
        }
        return acc;
      }, []);
      setContacts(uniqueContacts);
    }
    setLoading(false);
  }, []);

  // Auto-refresh integration
  const { enabled: autoRefreshEnabled, interval: autoRefreshInterval } = useAutoRefreshSettings();
  useAutoRefresh(fetchContacts, autoRefreshInterval, autoRefreshEnabled);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  };

  const handleDeleteContact = async () => {
    if (!deleteContact) return;
    
    setDeleting(true);
    try {
      // First delete all messages for this conversation
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', deleteContact.id);

      if (messagesError) throw messagesError;

      // Then delete the conversation
      const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', deleteContact.id);

      if (convError) throw convError;

      // Update local state
      setContacts(prev => prev.filter(c => c.id !== deleteContact.id));
      
      toast({
        title: "Contacto eliminado",
        description: `${deleteContact.customer_name || deleteContact.customer_phone} ha sido eliminado.`,
      });
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el contacto.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteContact(null);
    }
  };

  const handleBlockContact = async (contact: Contact) => {
    const isBlocked = !!contact.blocked_at;
    const newBlockedAt = isBlocked ? null : new Date().toISOString();
    
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ blocked_at: newBlockedAt })
        .eq('id', contact.id);

      if (error) throw error;

      // Update local state
      setContacts(prev => prev.map(c => 
        c.id === contact.id ? { ...c, blocked_at: newBlockedAt } : c
      ));
      
      toast({
        title: isBlocked ? "Contacto desbloqueado" : "Contacto bloqueado",
        description: isBlocked 
          ? `${contact.customer_name || contact.customer_phone} puede enviarte mensajes nuevamente.`
          : `${contact.customer_name || contact.customer_phone} ya no podrá enviarte mensajes.`,
      });
    } catch (error: any) {
      console.error('Error blocking contact:', error);
      toast({
        title: "Error",
        description: isBlocked ? "No se pudo desbloquear el contacto." : "No se pudo bloquear el contacto.",
        variant: "destructive",
      });
    }
    setBlockingContact(null);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      
      // Delete messages for all selected conversations
      for (const id of idsToDelete) {
        await supabase
          .from('messages')
          .delete()
          .eq('conversation_id', id);
      }
      
      // Delete all selected conversations
      const { error } = await supabase
        .from('conversations')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      // Update local state
      setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
      
      toast({
        title: "Contactos eliminados",
        description: `${selectedIds.size} contacto(s) eliminado(s) correctamente.`,
      });
      
      // Reset selection
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (error: any) {
      console.error('Error deleting contacts:', error);
      toast({
        title: "Error",
        description: "No se pudieron eliminar algunos contactos.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    
    setArchiving(true);
    try {
      const idsToArchive = Array.from(selectedIds);
      
      const { error } = await supabase
        .from('conversations')
        .update({ is_archived: true })
        .in('id', idsToArchive);

      if (error) throw error;

      // Update local state - remove archived contacts from view
      setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
      
      toast({
        title: "Contactos archivados",
        description: `${selectedIds.size} contacto(s) archivado(s) correctamente.`,
      });
      
      // Reset selection
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (error: any) {
      console.error('Error archiving contacts:', error);
      toast({
        title: "Error",
        description: "No se pudieron archivar algunos contactos.",
        variant: "destructive",
      });
    } finally {
      setArchiving(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      // Text search filter
      const name = contact.customer_name?.toLowerCase() || '';
      const phone = contact.customer_phone.toLowerCase();
      const search = searchTerm.toLowerCase();
      const matchesSearch = name.includes(search) || phone.includes(search);

      // Tag filter
      if (selectedTagFilters.size === 0) {
        return matchesSearch;
      }
      
      const contactTags = conversationTagMap[contact.id] || [];
      const matchesTags = Array.from(selectedTagFilters).some(tagId => 
        contactTags.includes(tagId)
      );
      
      return matchesSearch && matchesTags;
    });
  }, [contacts, searchTerm, selectedTagFilters, conversationTagMap]);

  const selectedContacts = useMemo(() => {
    return contacts.filter(c => selectedIds.has(c.id));
  }, [contacts, selectedIds]);

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagFilters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const clearTagFilters = () => {
    setSelectedTagFilters(new Set());
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-display font-semibold text-lg mb-4">Contactos</h2>
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          {selectionMode ? (
            <>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={exitSelectionMode}>
                  <X className="w-4 h-4" />
                </Button>
                <span className="font-medium">{selectedIds.size} seleccionado(s)</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={toggleSelectAll}
                className="text-sm"
              >
                {selectedIds.size === filteredContacts.length ? "Deseleccionar todo" : "Seleccionar todo"}
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-display font-semibold text-lg">Contactos</h2>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{contacts.length}</Badge>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Actualizar"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
                {contacts.length > 0 && (
                  <>
                    <Button 
                      variant={showTagFilter ? "secondary" : "ghost"}
                      size="icon" 
                      className="w-8 h-8"
                      onClick={() => setShowTagFilter(!showTagFilter)}
                      title="Filtrar por etiquetas"
                    >
                      <Tag className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-8 gap-1.5 px-2 border border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => setSelectionMode(true)}
                      title="Seleccionar contactos para enviar mensaje masivo"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span className="text-xs font-medium hidden sm:inline">Enviar</span>
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contacto..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Tag filter section */}
        <AnimatePresence>
          {showTagFilter && availableTags.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap gap-1.5">
                {availableTags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={selectedTagFilters.has(tag.id) ? "default" : "outline"}
                    className="cursor-pointer text-xs transition-all"
                    style={selectedTagFilters.has(tag.id) ? {
                      backgroundColor: tag.color,
                      borderColor: tag.color,
                    } : {
                      borderColor: `${tag.color}60`,
                      color: tag.color,
                    }}
                    onClick={() => toggleTagFilter(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {selectedTagFilters.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-xs text-muted-foreground"
                    onClick={clearTagFilters}
                  >
                    Limpiar
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showTagFilter && availableTags.length === 0 && (
          <p className="text-xs text-muted-foreground pt-2">
            No hay etiquetas. Crea una desde el menú de un contacto.
          </p>
        )}
      </div>

      <PullToRefreshContainer 
        onRefresh={handleRefresh}
        className="flex-1 min-h-0"
      >
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              {searchTerm || selectedTagFilters.size > 0 
                ? "No se encontraron contactos" 
                : "Aún no tienes contactos"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedTagFilters.size > 0 
                ? "Prueba con otros filtros o etiquetas"
                : "Los contactos aparecerán cuando recibas mensajes"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredContacts.map((contact, index) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`p-4 hover:bg-secondary/50 transition-colors cursor-pointer group ${
                  selectedIds.has(contact.id) ? 'bg-primary/10' : ''
                }`}
                onClick={() => selectionMode && toggleSelection(contact.id)}
              >
                <div className="flex items-center gap-3">
                  {selectionMode ? (
                    <Checkbox
                      checked={selectedIds.has(contact.id)}
                      onCheckedChange={() => toggleSelection(contact.id)}
                      className="w-5 h-5"
                    />
                  ) : null}
                  
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={contact.customer_profile_pic || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {getInitials(contact.customer_name, contact.customer_phone)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {contact.customer_name || contact.customer_phone}
                      </p>
                      {contact.blocked_at && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                          <Ban className="w-3 h-3 mr-1" />
                          Bloqueado
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span className="truncate">{contact.customer_phone}</span>
                    </div>
                    <ContactTags key={tagsRefreshKey} conversationId={contact.id} />
                  </div>

                  {!selectionMode && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem className="gap-2">
                          <MessageCircle className="w-4 h-4" />
                          Ir a conversación
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <User className="w-4 h-4" />
                          Ver perfil
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5">
                          <TagManager 
                            conversationId={contact.id} 
                            onTagsChange={handleTagsChange}
                          />
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => setBlockingContact(contact)}
                        >
                          {contact.blocked_at ? (
                            <>
                              <UserCheck className="w-4 h-4" />
                              Desbloquear contacto
                            </>
                          ) : (
                            <>
                              <Ban className="w-4 h-4" />
                              Bloquear contacto
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => setDeleteContact(contact)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar contacto
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </PullToRefreshContainer>

      {/* Floating action bar for bulk actions */}
      <AnimatePresence>
        {selectionMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 bg-primary text-primary-foreground rounded-lg shadow-lg p-3 flex items-center justify-between"
          >
            <span className="text-sm font-medium">
              {selectedIds.size} contacto(s) seleccionado(s)
            </span>
            <div className="flex items-center gap-2">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => setShowBulkMessageDialog(true)}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={handleBulkArchive}
                disabled={archiving}
                className="gap-2"
              >
                <Archive className="w-4 h-4" />
                <span className="hidden sm:inline">{archiving ? "Archivando..." : "Archivar"}</span>
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Eliminar</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single delete confirmation dialog */}
      <AlertDialog open={!!deleteContact} onOpenChange={(open) => !open && setDeleteContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar contacto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará a <strong>{deleteContact?.customer_name || deleteContact?.customer_phone}</strong> y todo el historial de mensajes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteContact}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} contacto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará los contactos seleccionados y todo su historial de mensajes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : `Eliminar ${selectedIds.size} contacto(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block/Unblock confirmation dialog */}
      <AlertDialog open={!!blockingContact} onOpenChange={(open) => !open && setBlockingContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockingContact?.blocked_at ? "¿Desbloquear contacto?" : "¿Bloquear contacto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockingContact?.blocked_at 
                ? `${blockingContact?.customer_name || blockingContact?.customer_phone} podrá enviarte mensajes nuevamente.`
                : `${blockingContact?.customer_name || blockingContact?.customer_phone} ya no podrá enviarte mensajes. Los mensajes existentes no se eliminarán.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => blockingContact && handleBlockContact(blockingContact)}
              className={blockingContact?.blocked_at ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {blockingContact?.blocked_at ? "Desbloquear" : "Bloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk message dialog */}
      <BulkMessageDialog
        open={showBulkMessageDialog}
        onOpenChange={setShowBulkMessageDialog}
        selectedContacts={selectedContacts}
        onComplete={exitSelectionMode}
      />
    </div>
  );
};