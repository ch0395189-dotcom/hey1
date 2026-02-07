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
    const { agentId } = await req.json();

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: 'Agent ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userApiKey: string | null = null;

    if (authHeader) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
          global: { headers: { Authorization: authHeader } }
        }
      );

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Get user's ElevenLabs API key from database
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const { data: apiKeyData } = await supabaseAdmin
          .from('user_api_keys')
          .select('api_key')
          .eq('user_id', user.id)
          .eq('provider', 'elevenlabs')
          .eq('is_active', true)
          .single();

        if (apiKeyData?.api_key) {
          userApiKey = apiKeyData.api_key;
          console.log('Using user\'s own ElevenLabs API key');
        }
      }
    }

    // Fallback to environment variable
    const ELEVENLABS_API_KEY = userApiKey || Deno.env.get("ELEVENLABS_API_KEY");
    
    if (!ELEVENLABS_API_KEY) {
      console.log('No ElevenLabs API key configured');
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured. Add your API key in Settings.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Fetching conversation token for agent:', agentId);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${response.status}` }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('Token generated successfully');

    return new Response(
      JSON.stringify({ token: data.token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating conversation token:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
