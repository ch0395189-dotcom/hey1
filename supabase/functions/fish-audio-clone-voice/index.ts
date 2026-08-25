import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing auth' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Invalid session' });

    const form = await req.formData();
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const files = form.getAll('audio').filter((f) => f instanceof File) as File[];

    if (!title || title.length > 120) return json({ error: 'Nombre inválido (1-120 caracteres)' });
    if (files.length === 0) return json({ error: 'Debes subir al menos un audio' });

    const MAX = 25 * 1024 * 1024;
    for (const f of files) {
      if (f.size > MAX) return json({ error: `El archivo ${f.name} supera los 25MB` });
    }

    // Owner (support impersonation-free default: the authenticated user)
    const targetUserId = user.id;

    const { data: keyRow } = await supabase
      .from('user_api_keys')
      .select('api_key')
      .eq('user_id', targetUserId)
      .eq('provider', 'fish_audio')
      .eq('is_active', true)
      .maybeSingle();

    if (!keyRow?.api_key) return json({ error: 'No tienes configurada la API Key de Fish Audio' });

    const fishForm = new FormData();
    fishForm.append('title', title);
    fishForm.append('type', 'tts');
    fishForm.append('train_mode', 'fast');
    fishForm.append('visibility', 'private');
    if (description) fishForm.append('description', description);
    for (const f of files) fishForm.append('voices', f, f.name || 'sample.mp3');

    const res = await fetch('https://api.fish.audio/model', {
      method: 'POST',
      headers: { Authorization: `Bearer ${keyRow.api_key.trim()}` },
      body: fishForm,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('Fish Audio clone error', res.status, text);
      return json({ error: `Fish Audio ${res.status}`, detail: text.slice(0, 500) });
    }

    let model: any = {};
    try { model = JSON.parse(text); } catch { /* ignore */ }
    const modelId = model?._id || model?.id;
    if (!modelId) return json({ error: 'Fish Audio no devolvió el ID del modelo', detail: text.slice(0, 500) });

    const { count } = await supabase
      .from('user_voice_clones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUserId)
      .eq('provider', 'fish_audio');

    const { error: insErr } = await supabase.from('user_voice_clones').insert({
      user_id: targetUserId,
      voice_name: title,
      voice_model_id: modelId,
      provider: 'fish_audio',
      is_default: (count ?? 0) === 0,
    });
    if (insErr) return json({ error: 'Voz creada en Fish Audio pero no se pudo guardar: ' + insErr.message, model_id: modelId });

    return json({ success: true, model_id: modelId, title });
  } catch (e) {
    console.error('clone-voice error', e);
    return json({ error: (e as Error).message });
  }
});
