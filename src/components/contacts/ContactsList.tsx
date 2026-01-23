import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, User, Phone, MessageCircle, MoreVertical, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

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
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg">Contactos</h2>
          <Badge variant="secondary">{contacts.length}</Badge>
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
                className="p-4 hover:bg-secondary/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
