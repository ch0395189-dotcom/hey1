import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, User, Phone, MessageCircle, MoreVertical, UserPlus, Trash2, CheckSquare, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
}

export const ContactsList = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('id, customer_name, customer_phone, customer_profile_pic, last_message_at, unread_count, whatsapp_account_id')
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

  const filteredContacts = contacts.filter(contact => {
    const name = contact.customer_name?.toLowerCase() || '';
    const phone = contact.customer_phone.toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || phone.includes(search);
  });

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
                {contacts.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8"
                    onClick={() => setSelectionMode(true)}
                    title="Seleccionar múltiples"
                  >
                    <CheckSquare className="w-4 h-4" />
                  </Button>
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
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              {searchTerm ? "No se encontraron contactos" : "Aún no tienes contactos"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Los contactos aparecerán cuando recibas mensajes
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
                    <p className="font-medium truncate">
                      {contact.customer_name || contact.customer_phone}
                    </p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span className="truncate">{contact.customer_phone}</span>
                    </div>
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
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <MessageCircle className="w-4 h-4" />
                          Ir a conversación
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <User className="w-4 h-4" />
                          Ver perfil
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
      </div>

      {/* Floating action bar for bulk actions */}
      <AnimatePresence>
        {selectionMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 bg-destructive text-destructive-foreground rounded-lg shadow-lg p-3 flex items-center justify-between"
          >
            <span className="text-sm font-medium">
              {selectedIds.size} contacto(s) seleccionado(s)
            </span>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => setShowBulkDeleteDialog(true)}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </Button>
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
    </div>
  );
};