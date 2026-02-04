import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all WhatsApp accounts
    const { data: accounts, error: fetchError } = await supabase
      .from('whatsapp_accounts')
      .select('id, phone_number_id, access_token, phone_number, display_name');

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch accounts', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const account of accounts || []) {
      try {
        // Fetch phone number details from Meta API
        const phoneDetailUrl = `https://graph.facebook.com/v21.0/${account.phone_number_id}?fields=display_phone_number,verified_name&access_token=${account.access_token}`;
        const response = await fetch(phoneDetailUrl);
        const data = await response.json();

        if (data.display_phone_number) {
          // Update the account with real phone number
          const { error: updateError } = await supabase
            .from('whatsapp_accounts')
            .update({ 
              phone_number: data.display_phone_number,
              display_name: data.verified_name || account.display_name
            })
            .eq('id', account.id);

          if (updateError) {
            results.push({
              id: account.id,
              success: false,
              error: updateError.message
            });
          } else {
            results.push({
              id: account.id,
              success: true,
              old_phone: account.phone_number,
              new_phone: data.display_phone_number,
              verified_name: data.verified_name
            });
          }
        } else {
          results.push({
            id: account.id,
            success: false,
            error: data.error?.message || 'No display_phone_number in response'
          });
        }
      } catch (err) {
        results.push({
          id: account.id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
