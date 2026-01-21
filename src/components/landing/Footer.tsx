import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-muted/30 border-t border-border py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-hero flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-xl">InboxWA</span>
            </Link>
            <p className="text-muted-foreground text-sm">
              La plataforma líder para gestionar tu bandeja de entrada de WhatsApp Business.
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Producto</h4>
            <ul className="space-y-3">
              <li><a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Características</a></li>
              <li><a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Precios</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Integraciones</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">API</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Recursos</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Documentación</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Guías</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Blog</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Soporte</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Legal</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Privacidad</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Términos</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Cookies</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} InboxWA. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
