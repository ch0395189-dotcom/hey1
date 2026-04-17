-- 1. Permitir action_type='schedule' en chatbot_flow_nodes (consistente con código y memoria)
ALTER TABLE public.chatbot_flow_nodes 
  DROP CONSTRAINT IF EXISTS chatbot_flow_nodes_action_type_check;

ALTER TABLE public.chatbot_flow_nodes
  ADD CONSTRAINT chatbot_flow_nodes_action_type_check
  CHECK (action_type = ANY (ARRAY['escalate'::text, 'end'::text, 'redirect'::text, 'schedule'::text]));

-- 2. Actualizar configuración del bot de Julio (Holístico)
UPDATE public.chatbot_configs
SET 
  name = 'Bot Holístico - Julio',
  mode = 'manual',
  is_enabled = true,
  welcome_message = E'🌟 *Bienvenid@ a Holístico* 🌟\n\nSomos especialistas en trabajos espirituales de alto poder. ✨\n\n¿Qué deseas hoy?',
  fallback_message = E'No entendí tu mensaje 🤔\n\nEscribe *menu* para ver las opciones o selecciona del menú.',
  escalation_keywords = ARRAY['maestro','consulta','hablar','agente','humano','asesor'],
  auto_end_on_leaf = false
WHERE id = '4e1d9257-7b88-46ef-9970-68c2be4ede1f';

-- 3. Insertar el nodo schedule que faltó
INSERT INTO public.chatbot_flow_nodes 
  (id, chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value, title, content, action_type, interactive_type, position)
VALUES (
  '66666666-0000-0000-0000-000000000001',
  '4e1d9257-7b88-46ef-9970-68c2be4ede1f',
  '44444444-0000-0000-0000-000000000001',
  'action',
  'option',
  'agendar_root',
  'Agendar Cita',
  E'📅 *AGENDA TU CONSULTA* 🙏\n\nPor favor responde con tu *nombre completo*, *fecha* y *hora* preferida.\n\nEjemplo: _Juan Pérez, 25 de diciembre, 3pm_\n\nNuestro Maestro confirmará tu cita lo antes posible ✨',
  'schedule',
  'none',
  0
) ON CONFLICT (id) DO NOTHING;

-- 4. Crear función SECURITY DEFINER para clonar bots (para uso del admin)
CREATE OR REPLACE FUNCTION public.clone_chatbot_to_account(
  p_source_config_id uuid,
  p_target_whatsapp_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_config_id uuid;
  v_node_map jsonb := '{}'::jsonb;
  v_old_node record;
  v_new_node_id uuid;
  v_source record;
BEGIN
  -- Solo admins pueden ejecutar
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden clonar bots';
  END IF;

  -- Borrar config existente del target (si la hay) - cascade borrará nodos/keywords
  DELETE FROM public.chatbot_configs WHERE whatsapp_account_id = p_target_whatsapp_account_id;

  -- Copiar config principal
  SELECT * INTO v_source FROM public.chatbot_configs WHERE id = p_source_config_id;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Bot fuente no encontrado';
  END IF;

  INSERT INTO public.chatbot_configs (
    whatsapp_account_id, name, is_enabled, mode, ai_system_prompt, ai_greeting,
    welcome_message, fallback_message, escalation_keywords, auto_end_on_leaf
  ) VALUES (
    p_target_whatsapp_account_id, v_source.name, v_source.is_enabled, v_source.mode,
    v_source.ai_system_prompt, v_source.ai_greeting, v_source.welcome_message,
    v_source.fallback_message, v_source.escalation_keywords, v_source.auto_end_on_leaf
  )
  RETURNING id INTO v_new_config_id;

  -- Copiar nodos en dos pasadas: primero crear todos sin parent, luego actualizar parents
  -- Pasada 1: insertar nodos y mapear viejo→nuevo id
  FOR v_old_node IN 
    SELECT * FROM public.chatbot_flow_nodes 
    WHERE chatbot_config_id = p_source_config_id 
    ORDER BY position
  LOOP
    INSERT INTO public.chatbot_flow_nodes (
      chatbot_config_id, parent_node_id, node_type, trigger_type, trigger_value,
      title, content, action_type, position, interactive_type, button_options,
      media_url, media_type
    ) VALUES (
      v_new_config_id, NULL, v_old_node.node_type, v_old_node.trigger_type,
      v_old_node.trigger_value, v_old_node.title, v_old_node.content,
      v_old_node.action_type, v_old_node.position, v_old_node.interactive_type,
      v_old_node.button_options, v_old_node.media_url, v_old_node.media_type
    )
    RETURNING id INTO v_new_node_id;
    
    v_node_map := v_node_map || jsonb_build_object(v_old_node.id::text, v_new_node_id::text);
  END LOOP;

  -- Pasada 2: actualizar parent_node_id usando el mapa
  FOR v_old_node IN 
    SELECT id, parent_node_id FROM public.chatbot_flow_nodes 
    WHERE chatbot_config_id = p_source_config_id AND parent_node_id IS NOT NULL
  LOOP
    UPDATE public.chatbot_flow_nodes
    SET parent_node_id = (v_node_map->>v_old_node.parent_node_id::text)::uuid
    WHERE id = (v_node_map->>v_old_node.id::text)::uuid;
  END LOOP;

  -- Copiar keywords
  INSERT INTO public.chatbot_keywords (chatbot_config_id, keyword, response, is_exact_match, priority)
  SELECT v_new_config_id, keyword, response, is_exact_match, priority
  FROM public.chatbot_keywords
  WHERE chatbot_config_id = p_source_config_id;

  -- Copiar knowledge base
  INSERT INTO public.chatbot_knowledge_base (chatbot_config_id, title, content, type, category, is_active)
  SELECT v_new_config_id, title, content, type, category, is_active
  FROM public.chatbot_knowledge_base
  WHERE chatbot_config_id = p_source_config_id;

  RETURN v_new_config_id;
END;
$$;