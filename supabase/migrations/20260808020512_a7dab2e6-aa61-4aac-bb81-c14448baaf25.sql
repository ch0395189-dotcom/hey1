-- Conectar el botón de WhatsApp a la opción "Hablar con un asesor"
UPDATE chatbot_flow_nodes
SET
  node_type = 'menu',
  action_type = null,
  interactive_type = 'cta_url',
  button_options = '[{"id":"cta","title":"Comunicarte con un asesor","url":"https://wa.me/573238261825?text=Hola%20quiero%20Hablar%20con%20un%20asesor"}]'::jsonb,
  content = '👤 ¡Con gusto! Presiona el botón para hablar directamente con un asesor por WhatsApp.'
WHERE id = 'ec063227-1f69-4678-86c0-593dbe5ec21c';

-- Eliminar nodo huérfano duplicado que ya no se usa
DELETE FROM chatbot_flow_nodes
WHERE id = '3902c016-bcec-447c-bdb4-b5c7d95113a9';