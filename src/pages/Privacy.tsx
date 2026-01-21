import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>

          <h1 className="font-display text-4xl font-bold mb-8">Política de Privacidad</h1>
          
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">1. Información que Recopilamos</h2>
              <p>
                En InboxWA, recopilamos información que usted nos proporciona directamente, incluyendo:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Información de cuenta: nombre, correo electrónico, contraseña</li>
                <li>Información de perfil de empresa</li>
                <li>Datos de integración con WhatsApp Business API</li>
                <li>Mensajes y conversaciones procesadas a través de nuestra plataforma</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">2. Uso de la Información</h2>
              <p>Utilizamos la información recopilada para:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Proporcionar, mantener y mejorar nuestros servicios</li>
                <li>Procesar transacciones y enviar notificaciones relacionadas</li>
                <li>Responder a sus comentarios, preguntas y solicitudes</li>
                <li>Enviar comunicaciones técnicas, actualizaciones y alertas de seguridad</li>
                <li>Monitorear y analizar tendencias de uso</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">3. Compartir Información</h2>
              <p>
                No vendemos, comercializamos ni transferimos a terceros su información personal identificable, excepto:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Con proveedores de servicios que nos ayudan a operar nuestra plataforma</li>
                <li>Para cumplir con obligaciones legales</li>
                <li>Para proteger nuestros derechos, privacidad, seguridad o propiedad</li>
                <li>En conexión con una fusión, adquisición o venta de activos</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">4. Seguridad de Datos</h2>
              <p>
                Implementamos medidas de seguridad diseñadas para proteger su información personal, incluyendo:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Encriptación de datos en tránsito y en reposo</li>
                <li>Acceso restringido a información personal</li>
                <li>Monitoreo regular de nuestros sistemas</li>
                <li>Cumplimiento con estándares de seguridad de la industria</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">5. Sus Derechos</h2>
              <p>Usted tiene derecho a:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Acceder a su información personal</li>
                <li>Corregir datos inexactos</li>
                <li>Solicitar la eliminación de sus datos</li>
                <li>Oponerse al procesamiento de sus datos</li>
                <li>Solicitar la portabilidad de sus datos</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">6. Cookies</h2>
              <p>
                Utilizamos cookies y tecnologías similares para mejorar su experiencia, analizar el tráfico 
                y personalizar el contenido. Puede controlar el uso de cookies a través de la configuración 
                de su navegador.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">7. Cambios a esta Política</h2>
              <p>
                Podemos actualizar esta política de privacidad periódicamente. Le notificaremos sobre 
                cambios significativos publicando la nueva política en esta página y actualizando la 
                fecha de "última actualización".
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">8. Contacto</h2>
              <p>
                Si tiene preguntas sobre esta política de privacidad, puede contactarnos en:
              </p>
              <p className="text-primary font-medium">soporte@inboxwa.com</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Privacy;
