import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceModelId, userId, modelId } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let apiKey: string | null = null;
    let voiceId = voiceModelId;

    if (userId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data } = await supabase
        .from('user_api_keys')
        .select('api_key, voice_model_id')
        .eq('user_id', userId)
        .eq('provider', 'elevenlabs')
        .eq('is_active', true)
        .single();
      if (data?.api_key) {
        apiKey = data.api_key;
        if (!voiceId && data.voice_model_id) voiceId = data.voice_model_id;
      }
    }

    apiKey = apiKey || Deno.env.get('ELEVENLABS_API_KEY') || null;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ElevenLabs API key not configured. Add yours in Settings.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!voiceId) {
      return new Response(JSON.stringify({ error: 'ElevenLabs voice ID is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = modelId || 'eleven_multilingual_v2';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      let msg = `ElevenLabs error ${response.status}`;
      if (response.status === 401) msg = 'Invalid ElevenLabs API key';
      if (response.status === 402) msg = 'Insufficient ElevenLabs credits';
      return new Response(JSON.stringify({ error: msg, detail: errorText }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
    });
  } catch (error) {
    console.error('Error generating ElevenLabs TTS:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});