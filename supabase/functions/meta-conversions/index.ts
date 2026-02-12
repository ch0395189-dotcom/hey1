import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PIXEL_ID = Deno.env.get('META_PIXEL_ID')!;
const ACCESS_TOKEN = Deno.env.get('META_CONVERSIONS_API_TOKEN')!;
const META_API_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

async function hashSHA256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ConversionEvent {
  event_name: string;
  event_id?: string;
  event_source_url?: string;
  user_data?: {
    email?: string;
    phone?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  custom_data?: {
    currency?: string;
    value?: number;
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    content_type?: string;
    status?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { events }: { events: ConversionEvent[] } = await req.json();

    if (!events || !Array.isArray(events) || events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No events provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processedEvents = await Promise.all(events.map(async (event) => {
      const userData: Record<string, string> = {};

      if (event.user_data?.email) {
        userData.em = await hashSHA256(event.user_data.email);
      }
      if (event.user_data?.phone) {
        userData.ph = await hashSHA256(event.user_data.phone);
      }
      if (event.user_data?.client_ip_address) {
        userData.client_ip_address = event.user_data.client_ip_address;
      }
      if (event.user_data?.client_user_agent) {
        userData.client_user_agent = event.user_data.client_user_agent;
      }
      if (event.user_data?.fbc) {
        userData.fbc = event.user_data.fbc;
      }
      if (event.user_data?.fbp) {
        userData.fbp = event.user_data.fbp;
      }

      return {
        event_name: event.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.event_id || `${event.event_name}_${Date.now()}`,
        event_source_url: event.event_source_url,
        action_source: 'website',
        user_data: userData,
        custom_data: event.custom_data || undefined,
      };
    }));

    const payload = {
      data: processedEvents,
      access_token: ACCESS_TOKEN,
    };

    console.log('Sending to Meta Conversions API:', JSON.stringify({ 
      event_count: processedEvents.length,
      events: processedEvents.map(e => e.event_name) 
    }));

    const response = await fetch(META_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('Meta Conversions API response:', JSON.stringify(result));

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Meta API error', details: result }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
