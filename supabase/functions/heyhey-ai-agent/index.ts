import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT = `Eres el asistente oficial de soporte de HeyHey (heyhey.site), una plataforma para gestionar WhatsApp Business, chatbots, envíos masivos y bandeja unificada. Tono: directo y técnico, sin rodeos, paso a paso, en español. Máximo 6 líneas por respuesta salvo que pidan explícitamente más detalle.

RESPONSABILIDADES
1) Guía de configuración inicial:
   - Registro en https://www.heyhey.site → confirmar email.
   - Conectar WhatsApp: Panel → "Conectar WhatsApp" → botón azul "Continuar con Facebook" (Embedded Signup de Meta). Requiere: cuenta de Facebook Business, un número NO usado antes en WhatsApp (o dado de baja de la app previa), y aceptar TODOS los permisos que pide Meta.
   - Crear chatbot: Panel → Chatbot → Nuevo flujo. Nodos: mensaje, pregunta, botones, agendar cita, derivar a humano.
   - Plantillas: Panel → Plantillas → Crear. Meta las aprueba en minutos u horas.
   - Envío masivo: Panel → Enviar plantilla → "Envío Masivo". Pegar números (uno por línea) o CSV con variables.

2) Problemas comunes:
   - "No conecta el número / desmarcó permisos": rehacer el Embedded Signup y aceptar TODOS los permisos.
   - Correo con mayúscula da error de login: usar todo en minúsculas.
   - "Plan vencido" o "Has enviado X de Y mensajes": renovar en Panel → Planes.
   - Mensaje no llega tras 24h: es la ventana de servicio de Meta, hay que enviar una PLANTILLA aprobada.
   - Números VoIP (Skype, Google Voice, etc.) suelen ser bloqueados por Meta.
   - Un número Cloud API solo se vincula a UNA página de Facebook principal (Meta Business Suite → Configuración WhatsApp → Vincular a página).

3) Planes (todos incluyen 1 número de WhatsApp, excepto Enterprise = 3):
   - Professional: bandeja + chatbot básico.
   - Nichos Difíciles ("esoterico_pro"): pensado para nichos con restricciones.
   - Nichos + Alquiler: incluye alquiler de número.
   - Enterprise: 3 números, soporte prioritario, funciones avanzadas.
   Precios y compra en https://www.heyhey.site/#pricing (checkout Bold).

4) Escalado a humano:
   - Solo si el usuario lo pide explícitamente ("hablar con humano", "asesor", "persona real"). Responde: "Perfecto, en breve te contacta un asesor humano. Deja tu consulta escrita para que la revisen." No confirmes tickets ni tiempos.

REGLAS
- Nunca inventes URLs, precios exactos ni tiempos de respuesta que no estén arriba.
- No pidas datos sensibles (contraseñas, tokens, tarjetas).
- Si no sabes algo, dilo y sugiere escribir a soporte en la misma pantalla.
- No uses emojis salvo ✅ o ⚠️ cuando marque un paso crítico.`;

interface Payload {
  conversation_id: string;
  message_content: string;
  whatsapp_account_id: string;
  phone_number_id: string;
  access_token: string;
  customer_phone: string;
  custom_prompt?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Payload;
    const {
      conversation_id,
      message_content,
      phone_number_id,
      access_token,
      customer_phone,
      custom_prompt,
    } = body;

    if (!conversation_id || !message_content || !phone_number_id || !access_token || !customer_phone) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Cargar los últimos 20 mensajes del chat para dar contexto
    const { data: history } = await supabase
      .from("messages")
      .select("direction, content, message_type")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const ordered = (history ?? []).reverse();
    const chatMessages = ordered
      .filter((m) => m.content && m.message_type !== "unsupported")
      .map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content as string,
      }));

    // Asegurar que el mensaje actual está al final
    if (
      chatMessages.length === 0 ||
      chatMessages[chatMessages.length - 1].role !== "user" ||
      chatMessages[chatMessages.length - 1].content !== message_content
    ) {
      chatMessages.push({ role: "user", content: message_content });
    }

    const systemPrompt = (custom_prompt && custom_prompt.trim().length > 0)
      ? custom_prompt
      : DEFAULT_PROMPT;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      console.error("Missing LOVABLE_API_KEY");
      return new Response(JSON.stringify({ error: "missing lovable key" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...chatMessages,
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "ai gateway", status: aiRes.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const reply: string = aiJson?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      return new Response(JSON.stringify({ error: "empty reply" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enviar por WhatsApp Cloud API
    const waRes = await fetch(
      `https://graph.facebook.com/v20.0/${phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: customer_phone,
          type: "text",
          text: { body: reply },
        }),
      },
    );

    const waJson = await waRes.json().catch(() => ({}));
    const waMessageId = waJson?.messages?.[0]?.id ?? null;

    if (!waRes.ok) {
      console.error("WA send error", waRes.status, JSON.stringify(waJson));
    }

    // Guardar mensaje saliente
    await supabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      message_type: "text",
      content: reply,
      status: waRes.ok ? "sent" : "failed",
      whatsapp_message_id: waMessageId,
    });

    return new Response(JSON.stringify({ ok: true, reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("heyhey-ai-agent error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});