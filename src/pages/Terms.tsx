import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { WhatsAppFloatingButton } from "@/components/ui/WhatsAppFloatingButton";

const Terms = () => {
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

          <h1 className="font-display text-4xl font-bold mb-8">Términos y Condiciones de Servicio</h1>
          
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">1. Aceptación de los Términos</h2>
              <p>
                Al acceder y utilizar InboxWA, usted acepta estar sujeto a estos términos y condiciones 
                de servicio. Si no está de acuerdo con alguna parte de estos términos, no podrá acceder 
                al servicio.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">2. Descripción del Servicio</h2>
              <p>
                InboxWA es una plataforma de gestión de mensajería que permite a las empresas:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Conectar y gestionar cuentas de WhatsApp Business API</li>
                <li>Centralizar conversaciones con clientes</li>
                <li>Automatizar respuestas y flujos de trabajo</li>
                <li>Analizar métricas de comunicación</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">3. Registro y Cuenta</h2>
              <p>Para utilizar nuestros servicios, usted debe:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Proporcionar información precisa y completa durante el registro</li>
                <li>Mantener la seguridad de su contraseña y cuenta</li>
                <li>Notificarnos inmediatamente sobre cualquier uso no autorizado</li>
                <li>Ser responsable de todas las actividades bajo su cuenta</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">4. Uso Aceptable</h2>
              <p>Usted se compromete a no utilizar el servicio para:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Enviar spam o mensajes no solicitados</li>
                <li>Violar leyes o regulaciones aplicables</li>
                <li>Infringir derechos de propiedad intelectual</li>
                <li>Transmitir contenido ilegal, dañino o ofensivo</li>
                <li>Interferir con el funcionamiento del servicio</li>
                <li>Intentar acceder a sistemas o datos no autorizados</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">5. Planes y Pagos</h2>
              <p>
                Los planes de suscripción y sus características están disponibles en nuestra página de precios. 
                Los términos de pago incluyen:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Facturación mensual o anual según el plan seleccionado</li>
                <li>Renovación automática a menos que se cancele</li>
                <li>Cambios de precio notificados con 30 días de anticipación</li>
                <li>No reembolsos por períodos parciales de uso</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">6. Propiedad Intelectual</h2>
              <p>
                El servicio y su contenido original, características y funcionalidad son propiedad de 
                InboxWA y están protegidos por leyes de derechos de autor, marcas registradas y otras 
                leyes de propiedad intelectual.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">7. Limitación de Responsabilidad</h2>
              <p>
                En ningún caso InboxWA, sus directores, empleados o agentes serán responsables por 
                daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo pérdida 
                de beneficios, datos, uso u otras pérdidas intangibles.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">8. Terminación</h2>
              <p>
                Podemos terminar o suspender su cuenta inmediatamente, sin previo aviso, por cualquier 
                razón, incluyendo si usted incumple estos términos. Tras la terminación, su derecho a 
                usar el servicio cesará inmediatamente.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">9. Cambios a los Términos</h2>
              <p>
                Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios 
                serán efectivos inmediatamente después de su publicación. El uso continuado del servicio 
                después de los cambios constituye su aceptación de los nuevos términos.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">10. Ley Aplicable</h2>
              <p>
                Estos términos se regirán e interpretarán de acuerdo con las leyes aplicables, sin 
                tener en cuenta sus disposiciones sobre conflictos de leyes.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">11. Contacto</h2>
              <p>
                Para cualquier pregunta sobre estos términos, puede contactarnos en:
              </p>
              <p className="text-primary font-medium">legal@inboxwa.com</p>
            </section>
          </div>
        </motion.div>
      </div>

      <WhatsAppFloatingButton />
    </div>
  );
};

export default Terms;
