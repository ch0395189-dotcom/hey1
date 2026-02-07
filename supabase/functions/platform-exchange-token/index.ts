import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
  };
}

interface ExchangeRequest {
  access_token?: string;
  code?: string;
  redirect_uri?: string;
  platform: 'messenger' | 'instagram';
  selected_page_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.user.id;
    const body: ExchangeRequest = await req.json();
    const { access_token, code, redirect_uri, platform, selected_page_id } = body;

    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');

    if (!appId || !appSecret) {
      return new Response(
        JSON.stringify({ error: 'Meta app configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let shortLivedToken: string;

    // If we received a code (from mobile redirect flow), exchange it for access token
    if (code && redirect_uri) {
      console.log('Exchanging authorization code for access token...');
      const codeExchangeResponse = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${appSecret}&code=${code}`
      );

      const codeExchangeData = await codeExchangeResponse.json();
      
      if (!codeExchangeResponse.ok || codeExchangeData.error) {
        console.error('Error exchanging code:', codeExchangeData);
        return new Response(
          JSON.stringify({ error: 'Failed to exchange authorization code', details: codeExchangeData.error?.message || codeExchangeData }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      shortLivedToken = codeExchangeData.access_token;
    } else if (access_token) {
      shortLivedToken = access_token;
    } else {
      return new Response(
        JSON.stringify({ error: 'access_token or code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange for long-lived token
    const longLivedTokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
    );

    const longLivedTokenData = await longLivedTokenResponse.json();
    
    if (!longLivedTokenResponse.ok || longLivedTokenData.error) {
      console.error('Error getting long-lived token:', longLivedTokenData);
      return new Response(
        JSON.stringify({ error: 'Failed to get long-lived token', details: longLivedTokenData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const longLivedUserToken = longLivedTokenData.access_token;

    // Get user's pages with Instagram accounts
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longLivedUserToken}`
    );

    const pagesData = await pagesResponse.json();

    if (!pagesResponse.ok || pagesData.error) {
      console.error('Error getting pages:', pagesData);
      return new Response(
        JSON.stringify({ error: 'Failed to get Facebook pages', details: pagesData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pages: FacebookPage[] = pagesData.data || [];

    // If no page selected, return the list of pages for user to choose
    if (!selected_page_id) {
      return new Response(
        JSON.stringify({ 
          action: 'select_page',
          access_token: longLivedUserToken, // Return token for subsequent page selection
          pages: pages.map(p => ({
            id: p.id,
            name: p.name,
            instagram_account_id: p.instagram_business_account?.id || null,
          }))
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the selected page
    const selectedPage = pages.find(p => p.id === selected_page_id);
    
    if (!selectedPage) {
      return new Response(
        JSON.stringify({ error: 'Selected page not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get long-lived page access token
    const pageTokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/${selected_page_id}?fields=access_token&access_token=${longLivedUserToken}`
    );

    const pageTokenData = await pageTokenResponse.json();
    
    if (!pageTokenResponse.ok || pageTokenData.error) {
      console.error('Error getting page token:', pageTokenData);
      return new Response(
        JSON.stringify({ error: 'Failed to get page access token', details: pageTokenData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pageAccessToken = pageTokenData.access_token;
    const verifyToken = crypto.randomUUID();

    // Create the platform account
    const insertData: any = {
      user_id: userId,
      platform,
      account_name: selectedPage.name,
      page_id: selectedPage.id,
      page_access_token: pageAccessToken,
      webhook_verify_token: verifyToken,
      is_active: true,
    };

    // Add Instagram account ID if connecting Instagram
    if (platform === 'instagram' && selectedPage.instagram_business_account?.id) {
      insertData.instagram_account_id = selectedPage.instagram_business_account.id;
    }

    const { data: account, error: insertError } = await supabase
      .from('platform_accounts')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating platform account:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save account', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Platform account created:', account.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        account: {
          id: account.id,
          platform: account.platform,
          account_name: account.account_name,
          page_id: account.page_id,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Platform exchange error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
