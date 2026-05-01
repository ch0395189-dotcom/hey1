-- Limpieza segura
DELETE FROM public.chatbot_configs WHERE whatsapp_account_id = '1a0d4434-651a-4f92-bd54-c90af20a8a1a';

-- Configuración principal
INSERT INTO public.chatbot_configs (
  id, whatsapp_account_id, name, is_enabled, mode,
  welcome_message, fallback_message,
  escalation_keywords, auto_end_on_leaf,
  ai_system_prompt, ai_greeting
) VALUES (
  'cccccccc-0000-0000-0000-00000000c0c0',
  '1a0d4434-651a-4f92-bd54-c90af20a8a1a',
  'Control Parental – Consentimiento',
  true,
  'manual',
  E'👨‍👩‍👧 *Bienvenido/a a nuestro Servicio de Control Parental Legal*\n\nTe ayudamos a proteger a tus hijos menores de edad en internet y redes sociales con herramientas legítimas y transparentes.\n\n⚖️ *Importante:* Solo trabajamos con dispositivos de tu propiedad usados por menores bajo tu tutela legal, siempre con consentimiento informado.\n\n¿En qué te podemos ayudar hoy? Escribe *menu* para ver opciones.',
  E'No entendí tu mensaje. Escribe *menu* para ver las opciones o *asesor* para hablar con una persona.',
  ARRAY['asesor','humano','persona','agente','hablar con alguien','llamada','llamar','contactar'],
  false,
  E'Eres un asesor de control parental legal y ético. Solo recomiendas herramientas legítimas (Google Family Link, Apple Screen Time, MDM con consentimiento). NUNCA ayudas a espiar, hackear, monitorear sin consentimiento ni acceder a cuentas ajenas. Si te piden algo ilegal, rechazas amablemente y rediriges a soluciones legales.',
  E'¡Hola! Soy tu asistente de control parental. ¿En qué te ayudo?'
);

-- Nodo 1: MENÚ PRINCIPAL
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a1111111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000c0c0', NULL, 'menu','option','menu',
'📋 Menú Principal',
E'¿Qué te interesa conocer?',
0,'buttons',
'[{"id":"opt_que_es","title":"¿Qué hacemos?"},{"id":"opt_servicios","title":"Servicios"},{"id":"opt_legal","title":"Marco legal"}]'::jsonb);

-- Nodo 2: ¿QUÉ HACEMOS?
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a2222222-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-00000000c0c0','a1111111-0000-0000-0000-000000000001','message','option','opt_que_es',
'Qué hacemos',
E'🛡️ *Protegemos a menores en entornos digitales*\n\n✅ *Lo que SÍ hacemos:*\n• Configurar Google Family Link y Apple Screen Time\n• Instalar MDM en celulares de tu propiedad usados por tu hijo/a menor\n• Filtros de contenido inapropiado\n• Límites de tiempo de pantalla\n• Reportes de actividad transparentes (el menor sabe que está activo)\n\n❌ *Lo que NO hacemos:*\n• Espiar parejas, ex parejas, empleados o adultos\n• Acceder a cuentas de WhatsApp ajenas\n• Software oculto o no autorizado\n• Recuperar mensajes eliminados de terceros\n\nEscribe *servicios* para ver opciones o *asesor* para hablar con alguien.',
1,'none','[]'::jsonb);

-- Nodo 3: SERVICIOS
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a3333333-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-00000000c0c0','a1111111-0000-0000-0000-000000000001','menu','option','opt_servicios',
'Servicios',
E'📱 *Nuestros servicios de control parental:*\n\n1️⃣ *Family Link / Screen Time* – Configuración gratuita de las apps oficiales de Google y Apple. Ideal para empezar.\n\n2️⃣ *MDM Profesional* – Solución completa con consentimiento del menor (a partir de 13 años) y firma del tutor legal.\n\n3️⃣ *Asesoría educativa* – Acompañamiento para hablar con tus hijos sobre uso responsable de internet.\n\n¿Cuál te interesa?',
2,'buttons',
'[{"id":"opt_consent","title":"Continuar"},{"id":"opt_legal","title":"Marco legal"}]'::jsonb);

-- Nodo 4: MARCO LEGAL
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a4444444-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-00000000c0c0','a1111111-0000-0000-0000-000000000001','message','option','opt_legal',
'Marco legal',
E'⚖️ *Marco legal del control parental*\n\nEl control parental es legal cuando:\n✅ El dispositivo es de propiedad del tutor legal\n✅ El usuario monitoreado es menor de edad bajo tu tutela\n✅ Existe consentimiento informado (en mayores de 13 años)\n✅ El software es visible y conocido por el menor\n\n🚫 *NO es legal:*\n• Monitorear a parejas, adultos o terceros sin consentimiento\n• Software oculto en dispositivos ajenos\n• Esto constituye delito de violación de comunicaciones privadas en la mayoría de países de LATAM\n\n📚 Nos basamos en la Convención de Derechos del Niño (ONU) y normativas locales de protección de datos.\n\nEscribe *consentimiento* para conocer nuestro proceso o *asesor* para hablar con alguien.',
3,'none','[]'::jsonb);

-- Nodo 5: CONSENTIMIENTO
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a5555555-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-00000000c0c0','a3333333-0000-0000-0000-000000000003','menu','option','opt_consent',
'Consentimiento',
E'✋ *Antes de continuar, necesitamos confirmar 3 cosas:*\n\n1️⃣ El dispositivo es de TU propiedad\n2️⃣ Lo usa un MENOR DE EDAD bajo tu tutela legal\n3️⃣ Aceptas informar al menor que el control está activo (obligatorio desde los 13 años)\n\nPor favor confirma seleccionando una opción:',
4,'buttons',
'[{"id":"opt_si_consent","title":"✅ Confirmo los 3"},{"id":"opt_no_consent","title":"❌ No cumplo"},{"id":"opt_dudas","title":"Tengo dudas"}]'::jsonb);

-- Nodo 6: NO CUMPLE
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a6666666-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-00000000c0c0','a5555555-0000-0000-0000-000000000005','message','option','opt_no_consent',
'No cumple',
E'🙏 Entendemos.\n\nSi lo que buscas es monitorear a un *adulto* (pareja, ex pareja, empleado, familiar mayor de edad), lamentablemente *no podemos ayudarte*: hacerlo sin consentimiento es delito y va contra nuestras políticas.\n\nSi tu situación es distinta, te recomendamos:\n• Diálogo directo con la persona\n• Asesoría psicológica o de pareja\n• Si hubo un delito en tu contra, denunciar a las autoridades\n\nGracias por tu comprensión. 💚',
5,'none','[]'::jsonb);

-- Nodo 7: SÍ CONSIENTE
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a7777777-0000-0000-0000-000000000007','cccccccc-0000-0000-0000-00000000c0c0','a5555555-0000-0000-0000-000000000005','menu','option','opt_si_consent',
'Sí consiente',
E'🎉 ¡Perfecto! Has confirmado el uso ético del servicio.\n\nPara conectarte con un asesor que te guíe paso a paso, elige una opción:',
6,'buttons',
'[{"id":"opt_asesor_chat","title":"💬 Hablar por chat"},{"id":"opt_asesor_call","title":"📞 Agendar llamada"}]'::jsonb);

-- Nodo 8: DUDAS
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options) VALUES
('a8888888-0000-0000-0000-000000000008','cccccccc-0000-0000-0000-00000000c0c0','a5555555-0000-0000-0000-000000000005','message','option','opt_dudas',
'Dudas',
E'🤔 *Preguntas frecuentes:*\n\n❓ *¿Mi hijo se va a enterar?*\nSí, y eso es fundamental. El control parental ético es transparente.\n\n❓ *¿Puedo ver sus chats de WhatsApp?*\nNo accedemos al contenido privado. Sí podemos: limitar tiempo de uso, bloquear apps, ver con quién chatea (sin leer), filtrar contenido.\n\n❓ *¿Funciona si el celular es de mi hijo?*\nSi es menor de edad y tú eres tutor legal, sí. Lo importante es la tutela.\n\n❓ *¿Cuánto cuesta?*\nFamily Link y Screen Time son gratis (cobramos solo asesoría). MDM tiene plan mensual. Te lo cotiza el asesor.\n\nEscribe *asesor* para hablar con alguien o *menu* para volver.',
7,'none','[]'::jsonb);

-- Nodo 9: ASESOR CHAT (escalate)
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options, action_type) VALUES
('a9999999-0000-0000-0000-000000000009','cccccccc-0000-0000-0000-00000000c0c0','a7777777-0000-0000-0000-000000000007','action','option','opt_asesor_chat',
'Asesor chat',
E'👤 *Te conectamos con un asesor humano*\n\nUn especialista te atenderá en breve por este mismo chat. Por favor cuéntanos:\n\n1. ¿Cuántos hijos quieres proteger y sus edades?\n2. ¿Qué dispositivos usan (Android / iPhone)?\n3. ¿Qué te preocupa más (tiempo de pantalla, contenido, redes sociales)?\n\n⏱️ Tiempo de respuesta: menos de 30 minutos en horario laboral.',
8,'none','[]'::jsonb,'escalate');

-- Nodo 10: AGENDAR LLAMADA (action con schedule)
INSERT INTO public.chatbot_flow_nodes (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, position, interactive_type, button_options, action_type) VALUES
('aaaa1010-0000-0000-0000-00000000aaaa','cccccccc-0000-0000-0000-00000000c0c0','a7777777-0000-0000-0000-000000000007','action','option','opt_asesor_call',
'Agendar llamada',
E'📅 *Agenda tu llamada con el asesor*\n\nPor favor indícanos:\n📆 Fecha preferida: {fecha}\n🕐 Hora preferida: {hora}\n\nTe llamaremos para explicarte el servicio, resolver dudas y configurar el control parental paso a paso (30 min aprox).\n\nUna vez agendado, recibirás confirmación por este chat. ✅',
9,'none','[]'::jsonb,'schedule');
