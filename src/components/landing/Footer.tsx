import { Link } from "react-router-dom";
import { MessageCircle, BadgeCheck } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-muted/30 border-t border-border py-8 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-8 md:mb-12">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-3 md:mb-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-hero flex items-center justify-center">
                <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg md:text-xl">InboxWA</span>
            </Link>
            <p className="text-muted-foreground text-xs md:text-sm mb-3 md:mb-4">
              La plataforma líder para gestionar tu bandeja de entrada de WhatsApp Business.
            </p>
            
            {/* Meta Business Partner Badge */}
            <div className="inline-flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-[#0668E1]/10 border border-[#0668E1]/20">
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#0668E1"/>
                <path d="M2 17L12 22L22 17" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[10px] md:text-xs font-medium text-[#0668E1]">Meta Business Partner</span>
              <BadgeCheck className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#0668E1]" />
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold text-sm md:text-base mb-3 md:mb-4">Producto</h4>
            <ul className="space-y-2 md:space-y-3">
              <li><a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Características</a></li>
              <li><a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Precios</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Integraciones</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">API</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-sm md:text-base mb-3 md:mb-4">Recursos</h4>
            <ul className="space-y-2 md:space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Documentación</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Guías</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Blog</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Soporte</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-sm md:text-base mb-3 md:mb-4">Legal</h4>
            <ul className="space-y-2 md:space-y-3">
              <li><Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Privacidad</Link></li>
              <li><Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Términos</Link></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs md:text-sm">Cookies</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 md:pt-8 border-t border-border text-center text-muted-foreground text-xs md:text-sm">
          © {new Date().getFullYear()} InboxWA. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
