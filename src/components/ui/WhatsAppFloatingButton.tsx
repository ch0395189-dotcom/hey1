import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";

interface WhatsAppFloatingButtonProps {
  phoneNumber?: string;
  message?: string;
  label?: string;
}

export const WhatsAppFloatingButton = ({ 
  phoneNumber = "+573238261825",
  message = "Hola, me gustaría obtener más información",
  label = "¿Necesitas ayuda?"
}: WhatsAppFloatingButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3">
      {/* Main Button */}
      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className="relative flex items-center gap-4 bg-[#25D366] text-white shadow-2xl hover:shadow-3xl rounded-full cursor-pointer px-8 py-5"
        aria-label="Contactar por WhatsApp"
      >
        {/* Pulse animation ring */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-25" />
        
        <MessageCircle className="w-10 h-10 fill-white relative z-10" />
        <span className="font-bold text-lg relative z-10 hidden sm:inline">Asesor</span>
      </motion.button>

      {/* Tooltip/Label */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, x: -10, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="bg-card border border-border shadow-lg rounded-xl px-4 py-2 whitespace-nowrap"
          >
            <p className="text-sm font-medium text-foreground">¿Necesitas ayuda?</p>
            <p className="text-xs text-muted-foreground">Te ayudamos a configurar tu número</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};