import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

interface WhatsAppFloatingButtonProps {
  phoneNumber?: string;
  message?: string;
}

export const WhatsAppFloatingButton = ({ 
  phoneNumber = "+573238261825",
  message = "Hola, me gustaría obtener más información"
}: WhatsAppFloatingButtonProps) => {
  const handleClick = () => {
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
  };

  return (
    <motion.button
      onClick={handleClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl flex items-center justify-center cursor-pointer"
      aria-label="Contactar por WhatsApp"
    >
      <MessageCircle className="w-7 h-7 fill-white" />
    </motion.button>
  );
};
