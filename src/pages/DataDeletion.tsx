import { Link } from "react-router-dom";
import { ArrowLeft, Trash2, Mail, Clock, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { WhatsAppFloatingButton } from "@/components/ui/WhatsAppFloatingButton";
import { Card, CardContent } from "@/components/ui/card";

const DataDeletion = () => {
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

          <div className="flex items-center gap-3 mb-8">
            <Trash2 className="w-10 h-10 text-destructive" />
            <h1 className="font-display text-4xl font-bold">Eliminación de Datos</h1>
          </div>
          
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <p className="text-lg">
                  En InboxWA, respetamos tu derecho a controlar tus datos personales. 
                  Esta página explica cómo puedes solicitar la eliminación de tus datos 
                  de nuestra plataforma.
                </p>
              </CardContent>
            </Card>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">¿Qué datos almacenamos?</h2>
              <p>Cuando utilizas InboxWA, podemos almacenar los siguientes datos:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Información de tu cuenta (nombre, correo electrónico)</li>
                <li>Información de tu perfil de empresa</li>
                <li>Tokens de acceso para integraciones con plataformas (WhatsApp, Facebook Messenger, Instagram)</li>
                <li>Historial de conversaciones y mensajes procesados</li>
                <li>Configuraciones de chatbot y flujos automatizados</li>
                <li>Información de contactos y etiquetas</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Cómo solicitar la eliminación de tus datos</h2>
              
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <Mail className="w-6 h-6 text-primary mt-1" />
                      <div>
                        <h3 className="font-semibold mb-2">Opción 1: Por correo electrónico</h3>
                        <p className="text-sm text-muted-foreground">
                          Envía un correo a <span className="text-primary font-medium">soporte@inboxwa.com</span> con 
                          el asunto "Solicitud de eliminación de datos" incluyendo:
                        </p>
                        <ul className="text-sm mt-2 space-y-1 text-muted-foreground">
                          <li>• Tu correo electrónico registrado</li>
                          <li>• Nombre de la cuenta o empresa</li>
                          <li>• Confirmación de la solicitud</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <Trash2 className="w-6 h-6 text-primary mt-1" />
                      <div>
                        <h3 className="font-semibold mb-2">Opción 2: Desde tu cuenta</h3>
                        <p className="text-sm text-muted-foreground">
                          Si tienes acceso a tu cuenta:
                        </p>
                        <ul className="text-sm mt-2 space-y-1 text-muted-foreground">
                          <li>1. Inicia sesión en InboxWA</li>
                          <li>2. Ve a Configuración</li>
                          <li>3. Selecciona "Eliminar cuenta"</li>
                          <li>4. Confirma la eliminación</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Proceso de eliminación</h2>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold">Recepción de la solicitud</h3>
                    <p className="text-muted-foreground">
                      Confirmaremos la recepción de tu solicitud dentro de las 48 horas hábiles.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold">Verificación de identidad</h3>
                    <p className="text-muted-foreground">
                      Podemos solicitar información adicional para verificar que eres el propietario de la cuenta.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold">Eliminación de datos</h3>
                    <p className="text-muted-foreground">
                      Procederemos a eliminar todos tus datos personales de nuestros sistemas activos.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    4
                  </div>
                  <div>
                    <h3 className="font-semibold">Confirmación</h3>
                    <p className="text-muted-foreground">
                      Te enviaremos una confirmación por correo electrónico cuando el proceso haya finalizado.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <Clock className="w-6 h-6" />
                Tiempo de procesamiento
              </h2>
              <p>
                El proceso de eliminación de datos se completará dentro de los <strong>30 días</strong> siguientes 
                a la verificación de tu solicitud, según lo establecido por las regulaciones de protección de datos.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Datos que pueden ser retenidos</h2>
              <p>
                Algunos datos pueden ser retenidos por períodos limitados debido a:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Obligaciones legales o regulatorias</li>
                <li>Prevención de fraude y seguridad</li>
                <li>Resolución de disputas pendientes</li>
                <li>Cumplimiento de términos de servicio</li>
              </ul>
              <p className="text-muted-foreground">
                Estos datos serán eliminados automáticamente una vez que expire el período de retención legal aplicable.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-primary" />
                Confirmación de eliminación para Facebook
              </h2>
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <p>
                    Si conectaste tu cuenta a través de Facebook Login, puedes verificar y gestionar 
                    los datos compartidos con nuestra aplicación directamente desde la
                    <a 
                      href="https://www.facebook.com/settings?tab=applications" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline mx-1"
                    >
                      configuración de aplicaciones de Facebook
                    </a>.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Después de enviar una solicitud de eliminación, recibirás un código de confirmación 
                    que puedes usar para verificar el estado de tu solicitud.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Contacto</h2>
              <p>
                Si tienes preguntas sobre la eliminación de datos o necesitas asistencia adicional, 
                contáctanos en:
              </p>
              <p className="text-primary font-medium text-lg">soporte@inboxwa.com</p>
            </section>
          </div>
        </motion.div>
      </div>

      <WhatsAppFloatingButton />
    </div>
  );
};

export default DataDeletion;
