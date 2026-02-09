import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SetupWebhookRequest {
  accountId: string;
  instanceId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { accountId, instanceId }: SetupWebhookRequest = await req.json();

    if (!accountId || !instanceId) {
      return new Response(
        JSON.stringify({ error: 'accountId and instanceId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the account belongs to the user
    const { data: account, error: accountError } = await supabase
      .from('whatsapp_accounts')
      .select('id, user_id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Account not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get HeyHey admin credentials
    const adminUrl = Deno.env.get('HEYHEY_ADMIN_URL');
    const adminToken = Deno.env.get('HEYHEY_ADMIN_TOKEN');

    if (!adminUrl || !adminToken) {
      return new Response(
        JSON.stringify({ error: 'HeyHey admin credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the webhook URL
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook-external?account_id=${accountId}`;

    console.log(`Setting up webhook for instance ${instanceId}`);
    console.log(`Webhook URL: ${webhookUrl}`);
    console.log(`Admin URL: ${adminUrl}`);

    // Try to update the user/instance webhook via HeyHey Admin API
    // WuzAPI uses /admin/users endpoint to manage users and their webhooks
    
    // First, try to get the current user configuration
    const getUserResponse = await fetch(`${adminUrl}/admin/users`, {
      method: 'GET',
      headers: {
        'Authorization': adminToken,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Get users response status: ${getUserResponse.status}`);
    
    let users = [];
    if (getUserResponse.ok) {
      const usersData = await getUserResponse.json();
      users = usersData.Users || usersData.users || usersData || [];
      console.log(`Found ${users.length} users`);
    }

    // Find the user with matching instance ID
    const targetUser = users.find((u: Record<string, unknown>) => 
      u.Id === instanceId || u.id === instanceId || u.name === instanceId
    );

    if (targetUser) {
      console.log(`Found user: ${JSON.stringify(targetUser)}`);
      
      // Update the user's webhook
      const updateResponse = await fetch(`${adminUrl}/admin/users/${targetUser.Id || targetUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook: webhookUrl,
          events: 'Message',
        }),
      });

      console.log(`Update response status: ${updateResponse.status}`);
      const updateResult = await updateResponse.text();
      console.log(`Update result: ${updateResult}`);

      if (updateResponse.ok) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Webhook configured successfully',
            webhookUrl 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If direct update didn't work, try alternative endpoints
    // Some WuzAPI implementations use /webhook endpoint
    const setWebhookResponse = await fetch(`${adminUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Authorization': adminToken,
        'Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        webhook: webhookUrl,
        events: ['Message', 'ReadReceipt', 'Presence'],
      }),
    });

    console.log(`Set webhook response status: ${setWebhookResponse.status}`);
    const setWebhookResult = await setWebhookResponse.text();
    console.log(`Set webhook result: ${setWebhookResult}`);

    if (setWebhookResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook configured via /webhook endpoint',
          webhookUrl 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return partial success with manual instructions
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Could not auto-configure webhook. Please configure manually.',
        webhookUrl,
        manualInstructions: `Configure this URL in the HeyHey admin panel for instance ${instanceId}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error setting up webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
