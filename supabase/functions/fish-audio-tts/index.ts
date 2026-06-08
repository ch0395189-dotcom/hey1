import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceModelId, userId, mode } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Fish Audio API key from database
    let fishAudioApiKey: string | null = null;
    let userVoiceModelId = voiceModelId;

    if (userId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: apiKeyData } = await supabase
        .from('user_api_keys')
        .select('api_key, voice_model_id')
        .eq('user_id', userId)
        .eq('provider', 'fish_audio')
        .eq('is_active', true)
        .single();

      if (apiKeyData?.api_key) {
        fishAudioApiKey = apiKeyData.api_key;
        // Use stored voice model if not provided in request
        if (!userVoiceModelId && apiKeyData.voice_model_id) {
          userVoiceModelId = apiKeyData.voice_model_id;
        }
        console.log('Using user\'s Fish Audio API key');
      }
    }

    // Fallback to environment variable
    const FISH_AUDIO_API_KEY = fishAudioApiKey || Deno.env.get("FISH_AUDIO_API_KEY");
    
    if (!FISH_AUDIO_API_KEY) {
      console.error('Fish Audio API key not configured');
      return new Response(
        JSON.stringify({ error: 'Fish Audio API key not configured. Add your API key in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating TTS with Fish Audio, voice model:', userVoiceModelId || 'default');

    // Call Fish Audio TTS API
    const requestBody: any = {
      text,
      format: 'mp3',
      mp3_bitrate: 128,
      latency: 'normal',
    };

    // Style presets: "natural" (fiel a la muestra) vs "creativo" (más expresivo)
    if (mode === 'creativo') {
      requestBody.temperature = 0.9;
      requestBody.top_p = 0.9;
    } else {
      requestBody.temperature = 0.7;
      requestBody.top_p = 0.7;
    }

    // Add voice model reference if provided
    if (userVoiceModelId) {
      requestBody.reference_id = userVoiceModelId;
    }

    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FISH_AUDIO_API_KEY}`,
        'Content-Type': 'application/json',
        'model': 's1',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fish Audio API error:', response.status, errorText);
      
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Invalid Fish Audio API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Insufficient Fish Audio credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Fish Audio API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return audio binary directly
    const audioBuffer = await response.arrayBuffer();
    console.log('TTS generated successfully, size:', audioBuffer.byteLength, 'bytes');

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
      },
    });

  } catch (error) {
    console.error('Error generating TTS:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
